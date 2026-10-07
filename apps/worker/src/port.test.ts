import { addCollege } from "@scholarcrew/core/colleges";
import { createFact, recordDecision, setSensitiveFact } from "@scholarcrew/core/memory";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { activities, and, eq, inArray, planItems, shareSettings, testScores } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { ContextSnapshot, type FactValue, type FactVisibility, type ShareCategory } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../test/helpers";
import { createCrewDataPort } from "./port";

const fact = (key: string, value: FactValue, visibility: FactVisibility) => ({
  key,
  value,
  visibility,
  source: "user_stated" as const,
  sourceRef: null,
});

async function setup() {
  const { core } = makeWorkerDeps();
  const student = await makeStudent(core.db, { state: "TX", county: "Maple" });
  return { core, port: createCrewDataPort(core), ...student };
}

async function unshare(s: Awaited<ReturnType<typeof setup>>, categories: ShareCategory[]) {
  await s.core.db
    .update(shareSettings)
    .set({ enabled: false })
    .where(and(eq(shareSettings.studentId, s.user.id), inArray(shareSettings.category, categories)));
}

/** One record in every category the port reads. */
async function seedRecords(s: Awaited<ReturnType<typeof setup>>) {
  const college = await factories.college(s.core.db, { name: "State U" });
  await addCollege(s.core, s.actor, { collegeId: college.id, fit: "target", plan: "RD" });
  await s.core.db.insert(activities).values({ ownerId: s.user.id, position: 0, name: "Robotics" });
  await s.core.db.insert(testScores).values({
    ownerId: s.user.id,
    test: "ACT",
    takenOn: "2026-06-13",
    official: true,
    composite: 29,
    sections: {},
  });
  await s.core.db
    .insert(planItems)
    .values({ ownerId: s.user.id, weekStart: "2026-10-05", title: "Outline the essay", kind: "custom", minutes: 30 });
  await factories.story(s.core.db, s.user.id);
  const essay = await factories.essay(s.core.db, s.user.id);
  const parent = await factories.parent(s.core.db);
  await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
  return { essay };
}

async function seedMemory(s: Awaited<ReturnType<typeof setup>>) {
  await createFact(s.core, s.actor, fact("dream_school", "Rice", "crew"));
  await createFact(s.core, s.actor, fact("favorite_subject", "Physics", "crew_family"));
  await createFact(s.core, s.actor, fact("private_note", "Nervous about interviews", "private"));
  await setSensitiveFact(s.core, s.actor, { kind: "income_range", enabled: true, value: "under_30k" });
  await setSensitiveFact(s.core, s.actor, { kind: "heritage", enabled: true, value: ["Mexican-American"] });
  await recordDecision(s.core, s.actor, { summary: "Apply EA to State U", rationale: "" });
  const listing = await factories.scholarship(s.core.db, { name: "Maple County STEM Award", deadline: "2026-10-20" });
  await saveScholarship(s.core, s.actor, { scholarshipId: listing.id });
  return listing;
}

describe("snapshot", () => {
  it("builds the crew snapshot without sensitive or private facts", async () => {
    const s = await setup();
    await seedMemory(s);
    const snap = await s.port.snapshot(s.user.id, "my_crew", "crew");
    expect(ContextSnapshot.safeParse(snap).success).toBe(true);
    expect(snap).toMatchObject({
      ownerId: s.user.id,
      displayName: "Test Student",
      today: "2026-10-06",
      timeZone: "America/Chicago",
      audience: "crew",
      room: "my_crew",
      roomRef: null,
      profile: { classYear: 2027, state: "TX", county: "Maple", gpa: 3.72 },
      enabledSpecialists: ["scout", "atlas", "quill", "aid", "ledger"],
    });
    expect(snap.facts.map((f) => [f.key, f.value])).toEqual([
      ["dream_school", "Rice"],
      ["favorite_subject", "Physics"],
    ]);
    expect(snap.decisions.map((d) => d.summary)).toEqual(["Apply EA to State U"]);
    expect(snap.deadlines.map((d) => d.title)).toContain("Maple County STEM Award");
    expect(snap.weekPlan.weekStart).toBe("2026-10-05");
    const json = JSON.stringify(snap);
    for (const secret of ["under_30k", "Mexican-American", "income_range", "heritage", "Nervous about interviews"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("gives family only family-visible facts and the categories the student shares", async () => {
    const s = await setup();
    await seedMemory(s);
    const parent = await factories.parent(s.core.db);
    await factories.family(s.core.db, { studentIds: [s.user.id], parentIds: [parent.id] });
    const fam = await s.port.snapshot(s.user.id, "family", "family");
    expect(fam.audience).toBe("family");
    expect(fam.facts.map((f) => f.key)).toEqual(["favorite_subject"]);
    expect(fam.decisions).toEqual([]);
    expect(fam.deadlines).toHaveLength(1);
    expect(JSON.stringify(fam)).not.toContain("under_30k");

    await s.core.db
      .update(shareSettings)
      .set({ enabled: false })
      .where(and(eq(shareSettings.studentId, s.user.id), eq(shareSettings.category, "deadlines")));
    const hidden = await s.port.snapshot(s.user.id, "family", "family");
    expect(hidden.deadlines).toEqual([]);
    expect(hidden.weekPlan).toEqual({ weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 });
    expect((await s.port.snapshot(s.user.id, "my_crew", "crew")).deadlines).toHaveLength(1);
  });

  it("turns on Prep with test scores and Impact with activities", async () => {
    const s = await setup();
    await s.core.db.insert(testScores).values({
      ownerId: s.user.id,
      test: "ACT",
      takenOn: "2026-06-13",
      official: true,
      composite: 29,
      sections: {},
    });
    await s.core.db.insert(activities).values({ ownerId: s.user.id, position: 0, name: "Robotics" });
    const snap = await s.port.snapshot(s.user.id, "my_crew", "crew");
    expect(snap.enabledSpecialists).toEqual(["scout", "atlas", "quill", "aid", "ledger", "prep", "impact"]);
  });

  it("turns on Prep and Impact from the onboarding facts before there's any data (D29)", async () => {
    const s = await setup();
    expect((await s.port.snapshot(s.user.id, "my_crew", "crew")).enabledSpecialists).toEqual([
      "scout",
      "atlas",
      "quill",
      "aid",
      "ledger",
    ]);
    await createFact(s.core, s.actor, fact("crew_prep_enabled", true, "crew"));
    await createFact(s.core, s.actor, fact("crew_impact_enabled", false, "crew"));
    expect((await s.port.snapshot(s.user.id, "my_crew", "crew")).enabledSpecialists).toEqual([
      "scout",
      "atlas",
      "quill",
      "aid",
      "ledger",
      "prep",
    ]);
    // The switch counts in family and temporary rooms too, even though those snapshots carry no crew facts.
    expect((await s.port.snapshot(s.user.id, "temporary", "crew")).enabledSpecialists).toContain("prep");
  });

  it("loads no memory in temporary chats (CR-07, D22)", async () => {
    const s = await setup();
    await seedMemory(s);
    const temp = await s.port.snapshot(s.user.id, "temporary", "crew");
    expect(temp.room).toBe("temporary");
    expect(temp.facts).toEqual([]);
    expect(temp.decisions).toEqual([]);
    expect(temp.deadlines.map((d) => d.title)).toContain("Maple County STEM Award");
  });
});

describe("family-bound port (12-1)", () => {
  it("returns only what the student shares, per category", async () => {
    const s = await setup();
    await seedMemory(s);
    await seedRecords(s);
    const crew = createCrewDataPort(s.core);
    const shared = createCrewDataPort(s.core, { audience: "family" });
    // Shared by default: family reads match the crew's.
    expect(await shared.collegeList(s.user.id)).toEqual(await crew.collegeList(s.user.id));
    expect(await shared.costs(s.user.id)).toEqual(await crew.costs(s.user.id));
    expect(await shared.activities(s.user.id)).toHaveLength(1);
    expect((await shared.weekPlan(s.user.id)).items).toHaveLength(1);
    expect(await shared.deadlines(s.user.id)).toEqual(await crew.deadlines(s.user.id));
    expect((await shared.matches(s.user.id, "family")).matches.length).toBeGreaterThan(0);

    await unshare(s, ["costs", "colleges", "activities", "deadlines", "scholarships"]);
    expect(await shared.costs(s.user.id)).toEqual([]);
    expect(await shared.liveGrants()).not.toContain("costs");
    // Share settings are read once per port (one port per job), so a fresh port sees the change.
    const off = createCrewDataPort(s.core, { audience: "family" });
    expect(await off.costs(s.user.id)).toEqual([]);
    expect(await off.offers(s.user.id)).toEqual({ columns: [], lowestFourYearOfferId: null, assumptions: [] });
    expect(await off.collegeList(s.user.id)).toEqual([]);
    expect(await off.applicationItems(s.user.id)).toEqual([]);
    expect(await off.activities(s.user.id)).toEqual([]);
    expect(await off.serviceProgress(s.user.id)).toEqual([]);
    expect(await off.deadlines(s.user.id)).toEqual([]);
    expect(await off.weekPlan(s.user.id)).toEqual({
      weekStart: "2026-10-05",
      items: [],
      totalMinutes: 0,
      doneCount: 0,
    });
    expect(await off.matches(s.user.id, "family")).toEqual({ matches: [], privateCount: 0 });
    const snap = await off.snapshot(s.user.id, "family", "family");
    expect(snap).toMatchObject({ deadlines: [], colleges: [], weekPlan: { items: [] } });
    // A crew-bound port still gates a call that asks for the family audience.
    expect(await crew.matches(s.user.id, "family")).toEqual({ matches: [], privateCount: 0 });
    // The crew port is unaffected.
    expect(await crew.collegeList(s.user.id)).toHaveLength(1);
    expect((await crew.costs(s.user.id)).length).toBeGreaterThan(0);
    expect(await crew.activities(s.user.id)).toHaveLength(1);
    expect((await crew.weekPlan(s.user.id)).items).toHaveLength(1);
  });

  it("never gives family test scores, gates aid checklists by deadlines, and keeps stories and essays behind their share switches", async () => {
    const s = await setup();
    const { essay } = await seedRecords(s);
    const crew = createCrewDataPort(s.core);
    const fam = createCrewDataPort(s.core, { audience: "family" });
    expect(await crew.testScores(s.user.id)).toHaveLength(1);
    expect(await fam.testScores(s.user.id)).toEqual([]);
    expect((await crew.aidChecklist(s.user.id)).length).toBeGreaterThan(0);
    // R2P-20: aid checklists follow `deadlines`, which is shared by default, matching 08 getAidChecklists.
    expect(await fam.aidChecklist(s.user.id)).toEqual(await crew.aidChecklist(s.user.id));
    await unshare(s, ["deadlines"]);
    expect(await createCrewDataPort(s.core, { audience: "family" }).aidChecklist(s.user.id)).toEqual([]);
    // essays and stories are off by default (DEFAULT_SHARED).
    expect(await crew.stories(s.user.id)).toHaveLength(1);
    expect(await fam.stories(s.user.id)).toEqual([]);
    expect((await crew.essay(s.user.id, essay.id))?.id).toBe(essay.id);
    expect(await fam.essay(s.user.id, essay.id)).toBeNull();
  });
});

describe("profile visibility and gaps", () => {
  it("blanks profile fields whose fact visibility the audience can't use (R2I-10)", async () => {
    const s = await setup();
    await createFact(s.core, s.actor, fact("county", "Maple", "scout_only"));
    await createFact(s.core, s.actor, fact("gpa_unweighted", 3.72, "crew"));
    const crew = await s.port.snapshot(s.user.id, "my_crew", "crew");
    expect(crew.profile).toMatchObject({ county: "", gpa: 3.72, state: "TX", classYear: 2027 });
    const fam = await createCrewDataPort(s.core, { audience: "family" }).snapshot(s.user.id, "family", "family");
    expect(fam.profile).toMatchObject({ county: "", gpa: null, state: "TX", classYear: 2027 });
  });

  it("fills each list entry's gap from costs, only when costs are shared (R2P-15)", async () => {
    const s = await setup();
    await seedRecords(s);
    const crew = createCrewDataPort(s.core);
    const [cost] = await crew.costs(s.user.id);
    const [entry] = await crew.collegeList(s.user.id);
    expect(entry?.gapUsd).not.toBeNull();
    expect(entry?.gapUsd).toBe(cost?.gapUsd);
    await unshare(s, ["costs"]);
    const fam = createCrewDataPort(s.core, { audience: "family" });
    const [famEntry] = await fam.collegeList(s.user.id);
    expect(famEntry?.collegeId).toBe(entry?.collegeId);
    expect(famEntry?.gapUsd).toBeNull();
  });
});

describe("record reads", () => {
  it("reads through core and returns null for missing or foreign records", async () => {
    const s = await setup();
    const listing = await factories.scholarship(s.core.db, { name: "Maple County STEM Award" });
    const college = await factories.college(s.core.db, { name: "State U" });
    const mine = await factories.essay(s.core.db, s.user.id);
    const other = await makeStudent(s.core.db);
    const theirs = await factories.essay(s.core.db, other.user.id);

    expect((await s.port.scholarship(listing.slug))?.name).toBe("Maple County STEM Award");
    expect(await s.port.scholarship("no-such-listing")).toBeNull();
    expect((await s.port.college(college.id))?.name).toBe("State U");
    expect(await s.port.college("999999")).toBeNull();
    expect((await s.port.essay(s.user.id, mine.id))?.id).toBe(mine.id);
    expect(await s.port.essay(s.user.id, theirs.id)).toBeNull();
    expect(await s.port.essay(s.user.id, "not-a-uuid")).toBeNull();

    const found = await s.port.searchScholarships({ q: "Maple", page: 1, pageSize: 20 });
    expect(found.map((x) => x.name)).toEqual(["Maple County STEM Award"]);
    // `local` needs a student actor in core; the port drops it instead of failing the tool call.
    expect(await s.port.searchScholarships({ q: "Maple", local: true, page: 1, pageSize: 20 })).toEqual(found);
    const crewMatches = await s.port.matches(s.user.id, "crew");
    expect(crewMatches.matches.map((m) => m.scholarship.id)).toContain(listing.id);
    const familyMatches = await s.port.matches(s.user.id, "family");
    expect(familyMatches.matches.every((m) => m.reasons.every((r) => !r.sensitive))).toBe(true);

    expect((await s.port.weekPlan(s.user.id)).weekStart).toBe("2026-10-05");
    expect(await s.port.collegeList(s.user.id)).toEqual([]);
    expect(await s.port.applicationItems(s.user.id)).toEqual([]);
    expect(await s.port.testScores(s.user.id)).toEqual([]);
    expect((await s.port.offers(s.user.id)).columns).toEqual([]);
    expect((await s.port.aidChecklist(s.user.id)).length).toBeGreaterThan(0);
    expect(await s.port.stories(s.user.id)).toEqual([]);
    expect(await s.port.activities(s.user.id)).toEqual([]);
    expect(Array.isArray(await s.port.costs(s.user.id))).toBe(true);
    expect(Array.isArray(await s.port.serviceProgress(s.user.id))).toBe(true);
    expect(Array.isArray(await s.port.deadlines(s.user.id))).toBe(true);
  });
});
