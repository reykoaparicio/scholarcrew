import { crewJobs, eq, essayComments, usageCounters } from "@scholarcrew/db";
import { type EssayInput, systemActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { createEssay, getEssay, saveVersion } from "./essays";
import { listComments, requestReview, resolveComment, saveQuillComments } from "./review";

const system = systemActor("test");
const BODY = "We had one extension cord. The cord ran under the door. One cord.";
const input: EssayInput = {
  title: "Rotary essay",
  prompt: "Describe a service project.",
  wordLimit: 500,
  charLimit: null,
  targetType: "general",
  targetCollegeId: null,
  targetScholarshipId: null,
};

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

async function savedEssay() {
  const essay = await createEssay(ctx.deps, student.actor, input);
  await saveVersion(ctx.deps, student.actor, essay.id, { body: BODY, baseVersion: 0 });
  return essay;
}

describe("requestReview", () => {
  it("queues an essay_review job and enqueues essay.review", async () => {
    const empty = await createEssay(ctx.deps, student.actor, input);
    await expect(requestReview(ctx.deps, student.actor, empty.id)).rejects.toMatchObject({ code: "invalid_input" });
    const essay = await savedEssay();
    const job = await requestReview(ctx.deps, student.actor, essay.id);
    expect(job).toMatchObject({ kind: "essay_review", status: "queued", refId: essay.id, progress: [] });
    expect(ctx.deps.jobs.sent).toEqual([{ name: "essay.review", payload: { jobId: job.id, essayId: essay.id } }]);
  });

  it("stops at the monthly allowance and is owner only", async () => {
    const essay = await savedEssay();
    await ctx.deps.db.insert(usageCounters).values({ userId: student.user.id, month: "2026-10", crewRequests: 20 });
    await expect(requestReview(ctx.deps, student.actor, essay.id)).rejects.toMatchObject({ code: "limit_reached" });
    expect(await ctx.deps.db.select().from(crewJobs).where(eq(crewJobs.ownerId, student.user.id))).toEqual([]);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "essays", true);
    await expect(requestReview(ctx.deps, parent.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("saveQuillComments", () => {
  const drafts = [
    { quote: "extension cord", occurrence: 1, kind: "question" as const, body: "What did the cord make possible?" },
    { quote: "cord", occurrence: 3, kind: "clarity" as const, body: "Is this the same cord?" },
    { quote: "cord", occurrence: 4, kind: "clarity" as const, body: "There is no fourth cord." },
    { quote: "thirty kids", occurrence: 1, kind: "structure" as const, body: "Not in the draft." },
  ];

  it("keeps only comments whose quote is at that occurrence, once per job", async () => {
    const essay = await savedEssay();
    const jobId = "00000000-0000-4000-8000-0000000000a1";
    const saved = await saveQuillComments(ctx.deps, system, {
      essayId: essay.id,
      ownerId: student.user.id,
      version: 1,
      jobId,
      comments: drafts,
    });
    expect(saved.map((c) => [c.quote, c.occurrence, c.author])).toEqual([
      ["extension cord", 1, "quill"],
      ["cord", 3, "quill"],
    ]);
    const again = await saveQuillComments(ctx.deps, system, {
      essayId: essay.id,
      ownerId: student.user.id,
      version: 1,
      jobId,
      comments: drafts,
    });
    expect(again.map((c) => c.id).sort()).toEqual(saved.map((c) => c.id).sort());
    expect(await ctx.deps.db.select().from(essayComments).where(eq(essayComments.essayId, essay.id))).toHaveLength(2);
  });

  it("is system only and needs an existing version", async () => {
    const essay = await savedEssay();
    const jobId = "00000000-0000-4000-8000-0000000000a2";
    await expect(
      saveQuillComments(ctx.deps, student.actor, {
        essayId: essay.id,
        ownerId: student.user.id,
        version: 1,
        jobId,
        comments: drafts,
      }),
    ).rejects.toThrow();
    await expect(
      saveQuillComments(ctx.deps, system, {
        essayId: essay.id,
        ownerId: student.user.id,
        version: 9,
        jobId,
        comments: drafts,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("listComments and resolveComment", () => {
  it("resolves for the owner only and hides resolved comments from getEssay", async () => {
    const essay = await savedEssay();
    const jobId = "00000000-0000-4000-8000-0000000000a3";
    const [first] = await saveQuillComments(ctx.deps, system, {
      essayId: essay.id,
      ownerId: student.user.id,
      version: 1,
      jobId,
      comments: [
        { quote: "extension cord", occurrence: 1, kind: "question", body: "Why one cord?" },
        { quote: "under the door", occurrence: 1, kind: "clarity", body: "Which door?" },
      ],
    });
    if (!first) throw new Error("no comment");
    const other = await makeStudent(ctx.deps);
    await expect(resolveComment(ctx.deps, other.actor, first.id)).rejects.toMatchObject({ code: "not_found" });
    await resolveComment(ctx.deps, student.actor, first.id);
    expect((await getEssay(ctx.deps, student.actor, essay.id)).comments.map((c) => c.quote)).toEqual([
      "under the door",
    ]);
    const all = await listComments(ctx.deps, student.actor, essay.id);
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.id === first.id)?.resolvedAt).toBe("2026-10-06T15:00:00.000Z");
    await expect(listComments(ctx.deps, other.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
