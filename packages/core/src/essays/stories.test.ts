import { factories } from "@scholarcrew/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import * as essaysModule from "./index";
import { archiveStory, checkStoryReuse, createStory, linkStory, listStories, updateStory } from "./stories";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;
const storyInput = {
  title: "Library STEM nights",
  moment: "Thirty kids showed up and we had one extension cord.",
  themes: ["service", "leadership"],
  evidence: "Library flyer",
  summary: "Started monthly STEM nights at the public library.",
};

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  await factories.college(ctx.deps.db, { id: "200002", name: "Cedar College" });
  await factories.college(ctx.deps.db, { id: "200003", name: "Birch Tech" });
});

describe("stories", () => {
  it("creates, updates, lists, and archives", async () => {
    const story = await createStory(ctx.deps, student.actor, storyInput);
    expect(story).toMatchObject({
      title: "Library STEM nights",
      themes: ["service", "leadership"],
      uses: [],
      archivedAt: null,
    });
    const updated = await updateStory(ctx.deps, student.actor, story.id, { title: "STEM nights" });
    expect(updated).toMatchObject({ title: "STEM nights", moment: storyInput.moment });
    expect((await listStories(ctx.deps, student.actor, student.user.id)).map((s) => s.id)).toEqual([story.id]);
    await archiveStory(ctx.deps, student.actor, story.id);
    expect(await listStories(ctx.deps, student.actor, student.user.id)).toEqual([]);
  });

  it("follows the stories share for parents and stays owner-only for writes", async () => {
    const story = await createStory(ctx.deps, student.actor, storyInput);
    const parent = await makeParentOf(ctx.deps, student.user.id);
    await expect(listStories(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    await setShare(ctx.deps, student.user.id, "stories", true);
    expect(await listStories(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await expect(updateStory(ctx.deps, parent.actor, story.id, { title: "x" })).rejects.toMatchObject({
      code: "not_found",
    });
    const other = await makeStudent(ctx.deps);
    await expect(archiveStory(ctx.deps, other.actor, story.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("linkStory and checkStoryReuse", () => {
  it("records one use per essay and warns before reusing a story for the same target", async () => {
    const story = await createStory(ctx.deps, student.actor, storyInput);
    const essay = await factories.essay(ctx.deps.db, student.user.id, {
      title: "Cedar supplement",
      targetType: "college",
      targetCollegeId: "200002",
    });
    const use = await linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: essay.id });
    expect(use).toMatchObject({ storyId: story.id, essayId: essay.id, collegeId: "200002", scholarshipId: null });
    expect((await linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: essay.id })).id).toBe(use.id);
    const [listed] = await listStories(ctx.deps, student.actor, student.user.id);
    expect(listed?.uses).toEqual([expect.objectContaining({ essayId: essay.id, essayTitle: "Cedar supplement" })]);

    expect(await checkStoryReuse(ctx.deps, student.actor, { storyId: story.id, collegeId: "200002" })).toEqual({
      storyId: story.id,
      alreadyUsedForTarget: true,
      priorUses: 1,
      message: "You've already used this story for Cedar College.",
    });
    expect(await checkStoryReuse(ctx.deps, student.actor, { storyId: story.id, collegeId: "200003" })).toEqual({
      storyId: story.id,
      alreadyUsedForTarget: false,
      priorUses: 1,
      message: null,
    });
  });

  it("handles scholarship targets and rejects other students' stories or essays", async () => {
    const listing = await factories.scholarship(ctx.deps.db, { name: "Maple Rotary" });
    const story = await createStory(ctx.deps, student.actor, storyInput);
    const essay = await factories.essay(ctx.deps.db, student.user.id, {
      targetType: "scholarship",
      targetScholarshipId: listing.id,
    });
    await linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: essay.id });
    const check = await checkStoryReuse(ctx.deps, student.actor, { storyId: story.id, scholarshipId: listing.id });
    expect(check.message).toBe("You've already used this story for Maple Rotary.");

    const other = await makeStudent(ctx.deps);
    const theirEssay = await factories.essay(ctx.deps.db, other.user.id);
    await expect(
      linkStory(ctx.deps, student.actor, { storyId: story.id, essayId: theirEssay.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(linkStory(ctx.deps, other.actor, { storyId: story.id, essayId: theirEssay.id })).rejects.toMatchObject(
      {
        code: "not_found",
      },
    );
    await expect(checkStoryReuse(ctx.deps, other.actor, { storyId: story.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("essays index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(essaysModule).sort()).toEqual([
      "archiveStory",
      "checkStoryReuse",
      "createEssay",
      "createStory",
      "getEssay",
      "linkStory",
      "listComments",
      "listEssays",
      "listStories",
      "listVersions",
      "requestReview",
      "resolveComment",
      "saveQuillComments",
      "saveVersion",
      "updateEssay",
      "updateStory",
    ]);
  });
});
