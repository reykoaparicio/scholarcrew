import { factories } from "@scholarcrew/db/testing";
import type { EssayInput } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { createEssay, getEssay, listEssays, listVersions, saveVersion, updateEssay } from "./essays";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const input = (o: Partial<EssayInput> = {}): EssayInput => ({
  title: "Common App personal essay",
  prompt: "Share an essay on any topic of your choice.",
  wordLimit: 650,
  charLimit: null,
  targetType: "general",
  targetCollegeId: null,
  targetScholarshipId: null,
  ...o,
});

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

describe("createEssay and getEssay", () => {
  it("starts empty and labels the target", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    expect(await getEssay(ctx.deps, student.actor, essay.id)).toMatchObject({
      currentVersion: 0,
      body: "",
      wordCount: 0,
      comments: [],
      targetLabel: null,
    });
    await factories.college(ctx.deps.db, { id: "200002", name: "Cedar College" });
    const college = await createEssay(
      ctx.deps,
      student.actor,
      input({ targetType: "college", targetCollegeId: "200002" }),
    );
    expect((await getEssay(ctx.deps, student.actor, college.id)).targetLabel).toBe("Cedar College");
    const listing = await factories.scholarship(ctx.deps.db, { name: "Maple Rotary" });
    const sch = await createEssay(
      ctx.deps,
      student.actor,
      input({ targetType: "scholarship", targetScholarshipId: listing.id }),
    );
    expect((await getEssay(ctx.deps, student.actor, sch.id)).targetLabel).toBe("Maple Rotary");
    const listed = await listEssays(ctx.deps, student.actor, student.user.id);
    expect(listed).toHaveLength(3);
    expect(listed.every((e) => e.latestWordCount === null)).toBe(true);
  });

  it("validates targets", async () => {
    await expect(createEssay(ctx.deps, student.actor, input({ targetType: "college" }))).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      createEssay(ctx.deps, student.actor, input({ targetType: "college", targetCollegeId: "999999" })),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("saveVersion", () => {
  it("creates numbered versions with word counts and rejects stale bases", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    const v1 = await saveVersion(ctx.deps, student.actor, essay.id, { body: "The first STEM night.", baseVersion: 0 });
    expect(v1).toMatchObject({ version: 1, wordCount: 4, authorId: student.user.id });
    await expect(
      saveVersion(ctx.deps, student.actor, essay.id, { body: "Older tab", baseVersion: 0 }),
    ).rejects.toMatchObject({ code: "conflict" });
    await saveVersion(ctx.deps, student.actor, essay.id, {
      body: "The first STEM night, 30 kids came.",
      baseVersion: 1,
    });
    expect((await listVersions(ctx.deps, student.actor, essay.id)).map((v) => v.version)).toEqual([2, 1]);
    expect(await getEssay(ctx.deps, student.actor, essay.id)).toMatchObject({
      currentVersion: 2,
      body: "The first STEM night, 30 kids came.",
      wordCount: 7,
      latestWordCount: 7,
    });
    const [listed] = await listEssays(ctx.deps, student.actor, student.user.id);
    expect(listed).toMatchObject({ id: essay.id, currentVersion: 2, latestWordCount: 7 });
  });

  it("lets only one of two concurrent saves win", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    const results = await Promise.allSettled([
      saveVersion(ctx.deps, student.actor, essay.id, { body: "Tab one", baseVersion: 0 }),
      saveVersion(ctx.deps, student.actor, essay.id, { body: "Tab two", baseVersion: 0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "conflict" });
    expect(await listVersions(ctx.deps, student.actor, essay.id)).toHaveLength(1);
  });
});

describe("updateEssay", () => {
  it("lets the owner change title, prompt, and status without touching versions (R2P-14)", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    await saveVersion(ctx.deps, student.actor, essay.id, { body: "The first STEM night.", baseVersion: 0 });
    ctx.clock.set("2026-10-08T15:00:00.000Z");
    const ready = await updateEssay(ctx.deps, student.actor, essay.id, { status: "ready" });
    expect(ready).toMatchObject({
      status: "ready",
      title: "Common App personal essay",
      currentVersion: 1,
      latestWordCount: 4,
      updatedAt: "2026-10-08T15:00:00.000Z",
    });
    const renamed = await updateEssay(ctx.deps, student.actor, essay.id, {
      title: "  Personal essay  ",
      prompt: "New prompt",
    });
    expect(renamed).toMatchObject({ title: "Personal essay", prompt: "New prompt", status: "ready" });
    expect((await listEssays(ctx.deps, student.actor, student.user.id))[0]?.status).toBe("ready");
    expect(await listVersions(ctx.deps, student.actor, essay.id)).toHaveLength(1);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await setShare(ctx.deps, student.user.id, "essays", true);
    const other = await makeStudent(ctx.deps);
    for (const actor of [parent.actor, other.actor]) {
      await expect(updateEssay(ctx.deps, actor, essay.id, { status: "submitted" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });
});

describe("essay access", () => {
  it("needs the essays share for parents, and only the owner saves", async () => {
    const essay = await createEssay(ctx.deps, student.actor, input());
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await expect(getEssay(ctx.deps, parent.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listEssays(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await setShare(ctx.deps, student.user.id, "essays", true);
    expect((await getEssay(ctx.deps, parent.actor, essay.id)).id).toBe(essay.id);
    await expect(
      saveVersion(ctx.deps, parent.actor, essay.id, { body: "Parent edit", baseVersion: 0 }),
    ).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(getEssay(ctx.deps, other.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listVersions(ctx.deps, other.actor, essay.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
