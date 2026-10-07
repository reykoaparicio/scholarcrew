import { essayComments } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  CrewJob,
  Essay,
  EssayComment,
  EssayVersion,
  EssayWithBody,
  Story,
  StoryReuseCheck,
  StoryUse,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { POST as resolveComment } from "../essay-comments/[id]/resolve/route";
import { DELETE as archiveStory, PATCH as patchStory } from "../stories/[id]/route";
import { POST as linkStory } from "../stories/link/route";
import { POST as reuseCheck } from "../stories/reuse-check/route";
import { POST as createStory, GET as listStories } from "../stories/route";
import { GET as listComments } from "./[id]/comments/route";
import { POST as review } from "./[id]/review/route";
import { GET as getEssay, PATCH as patchEssay } from "./[id]/route";
import { GET as listVersions, POST as saveVersion } from "./[id]/versions/route";
import { POST as createEssay, GET as listEssays } from "./route";

const deps = useTestDeps();

async function newEssay(cookie: string): Promise<Essay> {
  const body = { title: "Why nursing", prompt: "Tell us why you chose your major.", wordLimit: 650 };
  const res = await createEssay(request("/essays", { method: "POST", cookie, body }), NO_PARAMS);
  expect(res.status).toBe(201);
  return readJson<Essay>(res);
}

describe("essays and versions", () => {
  it("creates, lists, and reads an essay (ES-01)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    expect(essay).toMatchObject({ title: "Why nursing", wordLimit: 650, currentVersion: 0, targetType: "general" });
    const list = await readJson<Essay[]>(await listEssays(request("/essays", { cookie }), NO_PARAMS));
    expect(list.map((e) => e.id)).toEqual([essay.id]);
    const full = await readJson<EssayWithBody>(
      await getEssay(request(`/essays/${essay.id}`, { cookie }), params({ id: essay.id })),
    );
    expect(full).toMatchObject({ id: essay.id, body: "", wordCount: 0, comments: [] });
    const bad = await createEssay(
      request("/essays", { method: "POST", cookie, body: { title: "", prompt: "" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });

  it("saves versions with optimistic concurrency (ES-02)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const path = `/essays/${essay.id}/versions`;
    const id = params({ id: essay.id });
    const first = await saveVersion(
      request(path, { method: "POST", cookie, body: { body: "My first draft", baseVersion: 0 } }),
      id,
    );
    expect(first.status).toBe(201);
    expect(await readJson<EssayVersion>(first)).toMatchObject({ version: 1, wordCount: 3 });
    const stale = await saveVersion(
      request(path, { method: "POST", cookie, body: { body: "Other tab", baseVersion: 0 } }),
      id,
    );
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).code).toBe("conflict");
    expect(await readJson<EssayVersion[]>(await listVersions(request(path, { cookie }), id))).toHaveLength(1);
  });

  it("hides essays from other students and from parents without the essays share", async () => {
    const student = await signedInStudent(deps().db);
    const essay = await newEssay(student.cookie);
    const other = await signedInStudent(deps().db);
    expect(
      (await getEssay(request(`/essays/${essay.id}`, { cookie: other.cookie }), params({ id: essay.id }))).status,
    ).toBe(404);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const asParent = await listEssays(
      request(`/essays?studentId=${student.user.id}`, { cookie: parent.cookie }),
      NO_PARAMS,
    );
    expect(asParent.status).toBe(404);
  });

  it("updates an essay's status and title for its owner only (R2P-14)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const path = `/essays/${essay.id}`;
    const id = params({ id: essay.id });
    const patch = (c: string, body: unknown) => patchEssay(request(path, { method: "PATCH", cookie: c, body }), id);
    const ready = await patch(cookie, { status: "ready" });
    expect(ready.status).toBe(200);
    expect(await readJson<Essay>(ready)).toMatchObject({
      id: essay.id,
      status: "ready",
      title: "Why nursing",
      latestWordCount: null,
    });
    expect((await readJson<Essay>(await patch(cookie, { title: "Why I chose nursing" }))).title).toBe(
      "Why I chose nursing",
    );
    expect((await patch(cookie, {})).status).toBe(400);
    expect((await patch(cookie, { status: "done" })).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patch(other.cookie, { status: "submitted" })).status).toBe(404);
    const list = await readJson<Essay[]>(await listEssays(request("/essays", { cookie }), NO_PARAMS));
    expect(list.map((e) => e.status)).toEqual(["ready"]);
  });
});

describe("Quill review and comments", () => {
  it("needs a saved draft, then returns a queued job with 202 (ES-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const id = params({ id: essay.id });
    const path = `/essays/${essay.id}/review`;
    const empty = await review(request(path, { method: "POST", cookie }), id);
    expect(empty.status).toBe(400);
    await saveVersion(
      request(`/essays/${essay.id}/versions`, {
        method: "POST",
        cookie,
        body: { body: "A real draft", baseVersion: 0 },
      }),
      id,
    );
    const res = await review(request(path, { method: "POST", cookie }), id);
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "essay_review", status: "queued", refId: essay.id });
    expect(deps().jobs.sent).toContainEqual({ name: "essay.review", payload: { jobId: job.id, essayId: essay.id } });
    const other = await signedInStudent(deps().db);
    expect((await review(request(path, { method: "POST", cookie: other.cookie }), id)).status).toBe(404);
  });

  it("answers 402 limit_reached and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const id = params({ id: essay.id });
    await saveVersion(
      request(`/essays/${essay.id}/versions`, {
        method: "POST",
        cookie,
        body: { body: "A real draft", baseVersion: 0 },
      }),
      id,
    );
    await exhaustAllowance(deps().db, user.id);
    const res = await review(request(`/essays/${essay.id}/review`, { method: "POST", cookie }), id);
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });

  it("lists and resolves comments for the owner only", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const essay = await newEssay(cookie);
    const [comment] = await deps()
      .db.insert(essayComments)
      .values({
        essayId: essay.id,
        version: 1,
        author: "quill",
        kind: "question",
        quote: "draft",
        body: "What changed?",
      })
      .returning();
    if (!comment) throw new Error("comment insert failed");
    const list = await listComments(request(`/essays/${essay.id}/comments`, { cookie }), params({ id: essay.id }));
    expect((await readJson<EssayComment[]>(list)).map((c) => c.id)).toEqual([comment.id]);
    const path = `/essay-comments/${comment.id}/resolve`;
    const other = await signedInStudent(deps().db);
    expect(
      (await resolveComment(request(path, { method: "POST", cookie: other.cookie }), params({ id: comment.id })))
        .status,
    ).toBe(404);
    expect((await resolveComment(request(path, { method: "POST", cookie }), params({ id: comment.id }))).status).toBe(
      204,
    );
  });
});

describe("Story Bank", () => {
  it("creates, edits, links, checks reuse, and archives stories (ES-05, ES-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = {
      title: "Night shift",
      moment: "I translated for my grandmother at the clinic.",
      themes: ["family"],
    };
    const created = await createStory(request("/stories", { method: "POST", cookie, body: input }), NO_PARAMS);
    expect(created.status).toBe(201);
    const story = await readJson<Story>(created);
    expect(
      (await readJson<Story[]>(await listStories(request("/stories", { cookie }), NO_PARAMS))).map((s) => s.id),
    ).toEqual([story.id]);
    const path = `/stories/${story.id}`;
    const id = params({ id: story.id });
    const renamed = await patchStory(request(path, { method: "PATCH", cookie, body: { title: "Clinic nights" } }), id);
    expect((await readJson<Story>(renamed)).title).toBe("Clinic nights");
    expect((await patchStory(request(path, { method: "PATCH", cookie, body: { title: "" } }), id)).status).toBe(400);

    const essay = await newEssay(cookie);
    const link = await linkStory(
      request("/stories/link", { method: "POST", cookie, body: { storyId: story.id, essayId: essay.id } }),
      NO_PARAMS,
    );
    expect(link.status).toBe(201);
    expect(await readJson<StoryUse>(link)).toMatchObject({ storyId: story.id, essayId: essay.id });
    const check = await reuseCheck(
      request("/stories/reuse-check", { method: "POST", cookie, body: { storyId: story.id, collegeId: "100001" } }),
      NO_PARAMS,
    );
    expect(await readJson<StoryReuseCheck>(check)).toMatchObject({ storyId: story.id, alreadyUsedForTarget: false });

    const other = await signedInStudent(deps().db);
    expect(
      (await patchStory(request(path, { method: "PATCH", cookie: other.cookie, body: { title: "Mine" } }), id)).status,
    ).toBe(404);
    expect((await archiveStory(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    const bad = await createStory(
      request("/stories", { method: "POST", cookie, body: { title: "X", moment: "" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
  });
});
