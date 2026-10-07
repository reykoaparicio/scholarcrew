import { scholarshipApplications, serviceLogs } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ActivityInput } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setup } from "../scholarships/testkit";
import { deleteActivity, getRequirementProgress, listActivities, upsertActivity } from "./activities";
import * as impactModule from "./index";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const activity = (o: Partial<ActivityInput> = {}): ActivityInput => ({
  position: 1,
  name: "Robotics team",
  role: "Build lead",
  organization: "Maple High",
  description: "é".repeat(150),
  hoursPerWeek: 8,
  weeksPerYear: 30,
  grades: [10, 11, 12],
  category: "STEM",
  ...o,
});

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

describe("activities", () => {
  it("upserts by position, lists in order, and deletes", async () => {
    const first = await upsertActivity(ctx.deps, student.actor, activity());
    expect(first.description).toHaveLength(150);
    const replaced = await upsertActivity(ctx.deps, student.actor, activity({ name: "Robotics captain" }));
    expect(replaced.id).toBe(first.id);
    await upsertActivity(ctx.deps, student.actor, activity({ position: 2, name: "Library STEM nights" }));
    expect((await listActivities(ctx.deps, student.actor, student.user.id)).map((a) => a.name)).toEqual([
      "Robotics captain",
      "Library STEM nights",
    ]);
    await deleteActivity(ctx.deps, student.actor, first.id);
    expect(await listActivities(ctx.deps, student.actor, student.user.id)).toHaveLength(1);
  });

  it("lets sharing parents read and keeps deletes owner-only", async () => {
    const a = await upsertActivity(ctx.deps, student.actor, activity());
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await listActivities(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await expect(deleteActivity(ctx.deps, parent.actor, a.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(listActivities(ctx.deps, other.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("getRequirementProgress", () => {
  it("compares verified and total hours with each open, live listing's requirement", async () => {
    const { db } = ctx.deps;
    const req = (serviceHours: number | null) => ({
      essays: [],
      recommendations: 0,
      transcript: false,
      serviceHours,
      other: [],
    });
    const needs = await factories.scholarship(db, { name: "Service Award", requirements: req(20) });
    const none = await factories.scholarship(db, { name: "No Hours", requirements: req(null) });
    const lost = await factories.scholarship(db, { name: "Lost Award", requirements: req(40) });
    const retired = await factories.scholarship(db, {
      name: "Retired Award",
      requirements: req(30),
      status: "retired",
    });
    const scam = await factories.scholarship(db, {
      name: "Scam Award",
      requirements: req(30),
      scamFlags: ["application_fee"],
    });
    await db.insert(scholarshipApplications).values([
      { ownerId: student.user.id, scholarshipId: needs.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: none.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: lost.id, stage: "lost" },
      { ownerId: student.user.id, scholarshipId: retired.id, stage: "planned" },
      { ownerId: student.user.id, scholarshipId: scam.id, stage: "drafting" },
    ]);
    const base = { ownerId: student.user.id, organization: "Library", activity: "STEM night", servedOn: "2026-09-12" };
    await db.insert(serviceLogs).values([
      { ...base, minutes: 600, verification: "verified" },
      { ...base, minutes: 300 },
      { ...base, minutes: 120, verification: "declined" },
    ]);
    expect(await getRequirementProgress(ctx.deps, student.actor, student.user.id)).toEqual([
      {
        scholarshipId: needs.id,
        scholarshipName: "Service Award",
        requiredHours: 20,
        verifiedHours: 10,
        totalHours: 15,
      },
    ]);
  });
});

describe("impact index", () => {
  it("exports exactly the contract names", () => {
    expect(Object.keys(impactModule).sort()).toEqual([
      "addServiceLog",
      "deleteActivity",
      "deleteServiceLog",
      "getRequirementProgress",
      "getVerificationRequest",
      "listActivities",
      "listServiceLogs",
      "requestVerification",
      "submitVerification",
      "updateServiceLog",
      "upsertActivity",
    ]);
  });
});
