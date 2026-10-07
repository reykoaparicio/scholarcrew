import type { ModelClient } from "@scholarcrew/agents";
import { createScriptedModelClient } from "@scholarcrew/agents/testing";
import { getJob, getMessages, listConversations } from "@scholarcrew/core/crew";
import { getDocument, uploadDocument } from "@scholarcrew/core/documents";
import { listComments, requestReview, saveVersion } from "@scholarcrew/core/essays";
import { createOffer, getOffer } from "@scholarcrew/core/money";
import { agentRuns, crewJobs, eq, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, failingModel, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { DEMO_OFFER } from "../demo-model";
import { handleEssayReview } from "./essay-review";
import { NOT_PDF_TEXT, NO_LETTER_TEXT, PARSE_FAILED_TEXT, handleOfferParse } from "./offer-parse";
import { FAILED_TEXT } from "./shared";

const BODY =
  "When our robot died at regionals, I learned that a team can rebuild faster than it can blame. We rebuilt the drive train in two weeks.";

async function essaySetup(model?: ModelClient) {
  const ctx = makeWorkerDeps(model ? { model } : {});
  const student = await makeStudent(ctx.core.db);
  const essay = await factories.essay(ctx.core.db, student.user.id, { title: "Hill Country STEM essay" });
  await saveVersion(ctx.core, student.actor, essay.id, { body: BODY, baseVersion: 0 });
  const job = await requestReview(ctx.core, student.actor, essay.id);
  return { ...ctx, ...student, essay, job, payload: { jobId: job.id, essayId: essay.id } };
}

async function lastReply(s: { core: Parameters<typeof getMessages>[0]; actor: Parameters<typeof getMessages>[1] }) {
  const [room] = await listConversations(s.core, s.actor);
  if (!room) return null;
  return (await getMessages(s.core, s.actor, room.id)).at(-1)?.reply ?? null;
}

describe("essay.review", () => {
  it("saves Quill's comment and replies with a link to the essay (ES-04)", async () => {
    const s = await essaySetup();
    await handleEssayReview(s.deps, s.payload);
    const comments = await listComments(s.core, s.actor, s.essay.id);
    expect(comments.map((c) => c.quote)).toEqual([
      "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
    ]);
    expect(await getJob(s.core, SYSTEM, s.job.id)).toMatchObject({ status: "ready", safety: null });
    const reply = await lastReply(s);
    expect(reply).toMatchObject({
      text: 'Quill left 1 comment on "Hill Country STEM essay".',
      contributors: ["quill"],
    });
    expect(reply?.actionCards).toEqual([
      { kind: "open_link", id: "open-essay", label: "Open the essay", href: `/essays/${s.essay.id}` },
    ]);
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage?.crewRequests).toBe(1);
  });

  it("saves only comments whose quotes are really in the draft", async () => {
    const model = createScriptedModelClient(() => ({
      content: [
        {
          type: "tool_use",
          name: "submit_comments",
          input: {
            comments: [
              {
                quote: "We rebuilt the drive train in two weeks.",
                occurrence: 1,
                kind: "question",
                body: "What tools did you use?",
              },
              {
                quote: "This sentence is not in the draft.",
                occurrence: 1,
                kind: "clarity",
                body: "Which part do you mean?",
              },
            ],
          },
        },
      ],
    }));
    const s = await essaySetup(model);
    await handleEssayReview(s.deps, s.payload);
    const comments = await listComments(s.core, s.actor, s.essay.id);
    expect(comments.map((c) => c.quote)).toEqual(["We rebuilt the drive train in two weeks."]);
    expect((await lastReply(s))?.text).toBe('Quill left 1 comment on "Hill Country STEM essay".');
  });

  it("finishes with a refusal reply and no comments when the model refuses", async () => {
    const s = await essaySetup(createScriptedModelClient([{ stopReason: "refusal" }]));
    await handleEssayReview(s.deps, s.payload);
    expect(await listComments(s.core, s.actor, s.essay.id)).toEqual([]);
    expect(await getJob(s.core, SYSTEM, s.job.id)).toMatchObject({ status: "ready", safety: "refusal" });
    expect((await lastReply(s))?.text).toBe('Quill couldn\'t review "Hill Country STEM essay" this time.');
  });
});

async function offerSetup(model?: ModelClient, mime = "application/pdf") {
  const ctx = makeWorkerDeps(model ? { model } : {});
  const student = await makeStudent(ctx.core.db);
  const college = await factories.college(ctx.core.db, { name: "State U" });
  const doc = await uploadDocument(ctx.core, student.actor, {
    kind: "award_letter",
    filename: "state-u.pdf",
    mime,
    bytes:
      mime === "image/png"
        ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : Buffer.from("%PDF-1.4 State U award letter"),
  });
  const offer = await createOffer(ctx.core, student.actor, {
    collegeId: college.id,
    documentId: doc.id,
    awardYear: "2027-28",
  });
  const sent = ctx.core.jobs.sent.find((j) => j.name === "offer.parse");
  const payload = sent?.payload as { jobId: string; offerId: string };
  return { ...ctx, ...student, doc, offer, payload };
}

describe("offer.parse", () => {
  it("parses the letter, saves the lines for review, and records Aid's usage (MO-04)", async () => {
    const s = await offerSetup();
    await handleOfferParse(s.deps, s.payload);
    const offer = await getOffer(s.core, s.actor, s.offer.id);
    expect(offer).toMatchObject({ status: "needs_review", costOfAttendanceUsd: 27_800 });
    expect(offer.lines.map((l) => l.label)).toEqual(DEMO_OFFER.lines.map((l) => l.label));
    expect((await getDocument(s.core, s.actor, s.doc.id)).parseStatus).toBe("parsed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({ status: "ready" });
    expect((await lastReply(s))?.text).toBe(
      "Aid read your State U award letter and found 6 lines. Check each one before it counts.",
    );
    const runs = await s.core.db.select().from(agentRuns).where(eq(agentRuns.jobId, s.payload.jobId));
    expect(runs.map((r) => r.role)).toEqual(["aid"]);
    const [usage] = await s.core.db.select().from(usageCounters).where(eq(usageCounters.userId, s.user.id));
    expect(usage).toMatchObject({ crewRequests: 0, costMicros: runs[0]?.costMicros });
  });

  it("marks the offer failed when Aid refuses", async () => {
    const s = await offerSetup(createScriptedModelClient([{ stopReason: "refusal" }]));
    await handleOfferParse(s.deps, s.payload);
    expect((await getOffer(s.core, s.actor, s.offer.id)).status).toBe("failed");
    expect((await getDocument(s.core, s.actor, s.doc.id)).parseStatus).toBe("failed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({
      status: "failed",
      error: PARSE_FAILED_TEXT,
      safety: "refusal",
    });
  });

  it("doesn't send non-PDF letters to the model", async () => {
    const model = createScriptedModelClient([]);
    const s = await offerSetup(model, "image/png");
    await handleOfferParse(s.deps, s.payload);
    expect(model.extractRequests).toHaveLength(0);
    expect((await getOffer(s.core, s.actor, s.offer.id)).status).toBe("failed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({ status: "failed", error: NOT_PDF_TEXT });
  });

  it("marks the offer failed on unexpected errors", async () => {
    const s = await offerSetup(failingModel(new Error("boom")));
    await handleOfferParse(s.deps, s.payload);
    expect((await getOffer(s.core, s.actor, s.offer.id)).status).toBe("failed");
    expect(await getJob(s.core, SYSTEM, s.payload.jobId)).toMatchObject({ status: "failed", error: FAILED_TEXT });
  });

  it("points failed letters at a PDF re-upload or the offer tool, never at entering lines (R2P-8)", () => {
    expect(NOT_PDF_TEXT).toBe(
      "Only PDF award letters can be read. Upload the letter as a PDF, or compare it by hand in the offer tool.",
    );
    expect(PARSE_FAILED_TEXT).toBe(
      "We couldn't read that letter. Upload a clearer PDF, or compare it by hand in the offer tool.",
    );
    expect(NO_LETTER_TEXT).toBe(
      "That file doesn't look like an award letter. Upload the letter as a PDF, or compare it by hand in the offer tool.",
    );
    for (const text of [NOT_PDF_TEXT, PARSE_FAILED_TEXT, NO_LETTER_TEXT]) expect(text).not.toContain("enter the lines");
  });

  it("passes the letter's award year when it differs from the offer's (R2P-16)", async () => {
    const s = await offerSetup(createScriptedModelClient([{ extract: { ...DEMO_OFFER, awardYear: "2026-27" } }]));
    await handleOfferParse(s.deps, s.payload);
    expect(await getOffer(s.core, s.actor, s.offer.id)).toMatchObject({ status: "needs_review", awardYear: "2026-27" });
  });
});
