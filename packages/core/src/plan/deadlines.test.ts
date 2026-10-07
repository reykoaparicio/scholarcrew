import { aidDeadlines, eq, scholarships } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { listUpcomingDeadlines } from "./deadlines";
import {
  AWARD_YEAR,
  NOW,
  listCollege,
  makeDeps,
  makeParentOf,
  makeStateU,
  makeStudent,
  saveApp,
  setShare,
} from "./testkit";

async function setup() {
  const { deps } = makeDeps();
  const student = await makeStudent(deps);
  const id = student.user.id;
  const stateU = await makeStateU(deps);
  await listCollege(deps, id, stateU.id, { plan: "EA" });
  const sent = await factories.college(deps.db, {
    id: "100003",
    name: "Done College",
    deadlines: { ED: null, EA: "2026-10-20", REA: null, RD: null, rolling: false },
  });
  await listCollege(deps, id, sent.id, { plan: "EA", status: "submitted", minutesAfter: 1 });
  const css = await factories.college(deps.db, {
    id: "200001",
    name: "Northgate University",
    cssProfileRequired: true,
    aidPriorityDate: "2026-10-25",
    deadlines: { ED: null, EA: null, REA: null, RD: "2027-01-05", rolling: false },
  });
  await listCollege(deps, id, css.id, { plan: "RD", minutesAfter: 2 });
  const hill = await saveApp(deps, id, { name: "Hill Country STEM Award", amountUsd: 1000, deadline: "2026-10-15" });
  await saveApp(deps, id, { name: "Maple Rotary", stage: "matched", amountUsd: 2500, deadline: "2026-10-30" });
  await saveApp(deps, id, { name: "Submitted One", stage: "submitted", deadline: "2026-10-10" });
  await saveApp(deps, id, { name: "Past One", deadline: "2026-10-01" });
  await saveApp(deps, id, { name: "No Date", deadline: null });
  const base = { awardYear: AWARD_YEAR, sourceUrl: "https://example.org/aid", verifiedAt: new Date(NOW) };
  await deps.db.insert(aidDeadlines).values([
    { ...base, state: "TX", program: "Texas TASFA priority", deadline: "2027-01-15" },
    { ...base, state: "CA", program: "Cal Grant", deadline: "2026-10-20" },
  ]);
  return { deps, ...student, hill };
}

describe("listUpcomingDeadlines", () => {
  it("merges scholarships, applications, and aid dates in due order", async () => {
    const { deps, user, actor, hill } = await setup();
    const all = await listUpcomingDeadlines(deps, actor, user.id, 10);
    expect(all.map((d) => [d.kind, d.title, d.dueOn, d.daysLeft, d.warning])).toEqual([
      ["scholarship", "Hill Country STEM Award", "2026-10-15", 9, true],
      ["aid", "CSS Profile · Northgate University", "2026-10-25", 19, false],
      ["scholarship", "Maple Rotary", "2026-10-30", 24, false],
      ["application", "State U · Early Action", "2026-11-01", 26, false],
      ["application", "Northgate University · Regular Decision", "2027-01-05", 91, false],
      ["aid", "Texas TASFA priority", "2027-01-15", 101, false],
    ]);
    expect(all[0]).toMatchObject({ refType: "scholarship", refId: hill.scholarship.id, valueUsd: 1000 });
    const top = await listUpcomingDeadlines(deps, actor, user.id, 4);
    expect(top.map((d) => d.title)).toEqual([
      "Hill Country STEM Award",
      "CSS Profile · Northgate University",
      "Maple Rotary",
      "State U · Early Action",
    ]);
  });

  it("follows the deadlines share", async () => {
    const { deps, user } = await setup();
    const { actor: parent } = await makeParentOf(deps, user.id);
    const { actor: other } = await makeStudent(deps);
    expect(await listUpcomingDeadlines(deps, parent, user.id, 4)).toHaveLength(4);
    await expect(listUpcomingDeadlines(deps, other, user.id, 4)).rejects.toMatchObject({ code: "not_found" });
    await setShare(deps, user.id, "deadlines", false);
    await expect(listUpcomingDeadlines(deps, parent, user.id, 4)).rejects.toMatchObject({ code: "not_found" });
  });

  it("drops retired and scam-flagged listings (R2P-4)", async () => {
    const { deps, user, actor, hill } = await setup();
    await deps.db.update(scholarships).set({ status: "retired" }).where(eq(scholarships.id, hill.scholarship.id));
    const flagged = await saveApp(deps, user.id, { name: "Flagged One", deadline: "2026-10-12" });
    await deps.db
      .update(scholarships)
      .set({ scamFlags: ["application_fee"] })
      .where(eq(scholarships.id, flagged.scholarship.id));
    const titles = (await listUpcomingDeadlines(deps, actor, user.id, 10)).map((d) => d.title);
    expect(titles).not.toContain("Hill Country STEM Award");
    expect(titles).not.toContain("Flagged One");
    expect(titles).toContain("Maple Rotary");
  });
});
