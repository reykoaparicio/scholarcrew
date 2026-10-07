import { and, auditEvents, eq, familyTasks, sensitiveFacts } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import {
  createFact,
  crewVisibleFacts,
  listSensitiveFacts,
  readSensitiveForMatcher,
  setSensitiveFact,
  shareIncomeRangeToStudent,
} from "./index";

describe("sensitive facts", () => {
  it("lists all eight kinds, off by default", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const list = await listSensitiveFacts(deps, actorOf(user));
    expect(list).toHaveLength(8);
    expect(list.every((s) => !s.enabled && !s.hasValue && s.displayValue === null)).toBe(true);
  });

  it("encrypts values at rest and summarizes them for the owner", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const summary = await setSensitiveFact(deps, actorOf(user), {
      kind: "income_range",
      enabled: true,
      value: "48_75k",
    });
    expect(summary).toEqual({
      kind: "income_range",
      enabled: true,
      hasValue: true,
      displayValue: "$48k–75k",
      sharedByParent: false,
    });
    const [row] = await deps.db.select().from(sensitiveFacts).where(eq(sensitiveFacts.ownerId, user.id));
    expect(row?.ciphertext?.includes(Buffer.from("48_75k"))).toBe(false);
    expect(row?.iv).toHaveLength(12);
    expect(row?.tag).toHaveLength(16);
  });

  it("gives the matcher enabled values only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const me = actorOf(user);
    await setSensitiveFact(deps, me, { kind: "first_gen", enabled: true, value: null });
    await setSensitiveFact(deps, me, { kind: "income_range", enabled: true, value: "48_75k" });
    await setSensitiveFact(deps, me, { kind: "heritage", enabled: true, value: ["Mexican American"] });
    await setSensitiveFact(deps, me, { kind: "religion", enabled: false, value: ["Catholic"] });
    expect(await readSensitiveForMatcher(deps, SYSTEM, user.id)).toEqual({
      firstGen: true,
      incomeRange: "48_75k",
      heritage: ["Mexican American"],
      disability: false,
      religion: [],
      militaryFamily: false,
      fosterCare: false,
      noncitizenFilter: false,
    });
    const off = await setSensitiveFact(deps, me, { kind: "income_range", enabled: false, value: null });
    expect(off).toMatchObject({ enabled: false, hasValue: true });
    expect((await readSensitiveForMatcher(deps, SYSTEM, user.id)).incomeRange).toBeNull();
  });

  it("lets only the system read matcher values", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(readSensitiveForMatcher(deps, actorOf(user), user.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("never puts sensitive values in crew-visible facts", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await setSensitiveFact(deps, actorOf(user), { kind: "heritage", enabled: true, value: ["Mexican American"] });
    await setSensitiveFact(deps, actorOf(user), { kind: "income_range", enabled: true, value: "under_30k" });
    await createFact(deps, actorOf(user), {
      key: "county",
      value: "Maple",
      visibility: "crew",
      source: "user_stated",
      sourceRef: null,
    });
    const facts = await crewVisibleFacts(deps, SYSTEM, user.id, "crew");
    expect(facts.map((f) => f.key)).toEqual(["county"]);
    expect(JSON.stringify(facts)).not.toMatch(/Mexican American|under_30k/);
  });

  it("keeps summaries per owner", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    await setSensitiveFact(deps, actorOf(user), { kind: "first_gen", enabled: true, value: null });
    expect((await listSensitiveFacts(deps, actorOf(other))).some((s) => s.enabled)).toBe(false);
  });

  it("lets a parent in the family share an income range and completes the task", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await deps.db.insert(familyTasks).values({
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "share_income_range",
      title: "Share an income range",
    });
    await shareIncomeRangeToStudent(deps, actorOf(parent), { studentId: student.id, range: "30_48k" });
    const income = (await listSensitiveFacts(deps, actorOf(student))).find((s) => s.kind === "income_range");
    expect(income).toMatchObject({ enabled: false, sharedByParent: true, displayValue: "$30k–48k" });
    expect((await readSensitiveForMatcher(deps, SYSTEM, student.id)).incomeRange).toBeNull();
    const [task] = await deps.db
      .select()
      .from(familyTasks)
      .where(and(eq(familyTasks.familyId, family.id), eq(familyTasks.kind, "share_income_range")));
    expect(task?.status).toBe("done");
    expect(task?.completedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("refuses income sharing from outside the family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: otherStudent } = await factories.student(deps.db);
    const outsider = await factories.parent(deps.db);
    await expect(
      shareIncomeRangeToStudent(deps, actorOf(outsider), { studentId: student.id, range: "30_48k" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      shareIncomeRangeToStudent(deps, actorOf(otherStudent), { studentId: student.id, range: "30_48k" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates kind and value shapes", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(
      setSensitiveFact(deps, actorOf(user), { kind: "first_gen", enabled: true, value: ["x"] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("private settings audit and parent offerings", () => {
  it("records no kind/value in the audit and preserves student choices", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await setSensitiveFact(deps, actorOf(student), { kind: "income_range", enabled: true, value: "48_75k" });
    await shareIncomeRangeToStudent(deps, actorOf(parent), { studentId: student.id, range: "under_30k" });
    expect((await readSensitiveForMatcher(deps, SYSTEM, student.id)).incomeRange).toBe("48_75k");
    const rows = await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "sensitive_facts_changed"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.entityId).toBe(student.id);
      expect(row.meta).toEqual({});
    }
    expect(JSON.stringify(rows)).not.toMatch(/income_range|48_75k|under_30k/);
  });
});
