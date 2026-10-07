import { activities, collegeList, crewJobs, eq, sensitiveFacts, sessions, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { OnboardingInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { getSessionUser } from "../auth";
import { sha256Hex } from "../crypto";
import { listFacts } from "../memory";
import { createTestDeps, fixedClock } from "../shared";
import { completeOnboarding, getAutofillProfile, getMe, getProfile, isUnderMinAge, updateProfile } from "./index";

function onboarding(o: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    displayName: "Maya",
    birthYear: 2009,
    classYear: 2027,
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    city: "Cedar Falls",
    gpaUnweighted: 3.72,
    intendedMajors: ["Mechanical engineering"],
    interests: ["Robotics", "Tutoring"],
    timeZone: "America/Chicago",
    collegeIds: [],
    sensitive: [],
    ...o,
  };
}

describe("getMe", () => {
  it("shows a new student who hasn't onboarded", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db, { email: "maya@example.test" });
    expect(await getMe(deps, actorOf(user))).toMatchObject({
      user: { email: "maya@example.test", role: "student" },
      profile: null,
      onboardingComplete: false,
      family: null,
      plan: "free",
    });
  });
});

describe("completeOnboarding", () => {
  it("writes the profile, facts, sensitive facts, starter list, and first jobs", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    const college = await factories.college(deps.db);
    const me = await completeOnboarding(
      deps,
      actorOf(user),
      onboarding({
        collegeIds: [college.id, "999999"],
        sensitive: [{ kind: "first_gen", enabled: true, value: null }],
      }),
    );
    expect(me.onboardingComplete).toBe(true);
    expect(me.user).toMatchObject({ displayName: "Maya", birthYear: 2009 });
    expect(me.profile).toMatchObject({
      gpaUnweighted: 3.72,
      county: "Maple",
      onboardingCompletedAt: "2026-10-06T15:00:00.000Z",
    });
    const facts = await listFacts(deps, actorOf(user), user.id);
    expect(facts.map((f) => f.key).sort()).toEqual([
      "city",
      "class_year",
      "county",
      "gpa_unweighted",
      "high_school",
      "intended_majors",
      "interests",
      "state",
    ]);
    expect(facts.every((f) => f.source === "user_stated")).toBe(true);
    const [sensitive] = await deps.db.select().from(sensitiveFacts).where(eq(sensitiveFacts.ownerId, user.id));
    expect(sensitive).toMatchObject({ kind: "first_gen", enabled: true });
    const list = await deps.db.select().from(collegeList).where(eq(collegeList.ownerId, user.id));
    expect(list.map((r) => [r.collegeId, r.fit, r.plan, r.season])).toEqual([[college.id, "target", "RD", "2026-27"]]);
    const [job] = await deps.db.select().from(crewJobs).where(eq(crewJobs.ownerId, user.id));
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued" });
    expect(deps.jobs.sent).toEqual([
      { name: "plan.weekly", payload: { jobId: job?.id, ownerId: user.id } },
      { name: "sweep.student", payload: { studentId: user.id } },
    ]);
  });

  it("runs once", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    await completeOnboarding(deps, actorOf(user), onboarding());
    await expect(completeOnboarding(deps, actorOf(user), onboarding())).rejects.toMatchObject({ code: "conflict" });
  });

  it("blocks users under 13 and ends their sessions", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    await deps.db.insert(sessions).values({
      userId: user.id,
      tokenHash: sha256Hex("session-token"),
      expiresAt: new Date("2026-11-05T15:00:00.000Z"),
    });
    await expect(completeOnboarding(deps, actorOf(user), onboarding({ birthYear: 2014 }))).rejects.toMatchObject({
      code: "forbidden",
      message: "ScholarCrew is for students 13 and older",
      details: { reason: "underage" },
    });
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.status).toBe("blocked_underage");
    expect(row?.deletedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(await deps.db.select().from(sessions)).toHaveLength(0);
    expect(await getSessionUser(deps, "session-token")).toBeNull();
    expect(deps.jobs.sent).toEqual([]);
  });

  it("accepts a student who turns 13 this year", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    expect((await completeOnboarding(deps, actorOf(user), onboarding({ birthYear: 2013 }))).onboardingComplete).toBe(
      true,
    );
  });

  it("reads the year in the student's zone, not UTC (R3V-13)", async () => {
    // 2027-01-01T03:00Z is Dec 31, 2026, 9 pm in Chicago: local year 2026, so a 2014 birth year is 12.
    const deps = createTestDeps({ clock: fixedClock("2027-01-01T03:00:00.000Z") });
    const user = await factories.user(deps.db);
    await expect(
      completeOnboarding(deps, actorOf(user), onboarding({ birthYear: 2014, timeZone: "America/Chicago" })),
    ).rejects.toMatchObject({ code: "forbidden", details: { reason: "underage" } });
    expect(isUnderMinAge(2014, "2026-12-31")).toBe(true);
    expect(isUnderMinAge(2014, "2027-01-01")).toBe(false);
    expect(isUnderMinAge(2013, "2026-10-06")).toBe(false);
  });

  it("is for students only and checks the time zone", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    const user = await factories.user(deps.db);
    await expect(completeOnboarding(deps, actorOf(parent), onboarding())).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      completeOnboarding(deps, actorOf(user), onboarding({ timeZone: "Mars/Olympus" })),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("profile", () => {
  it("updateProfile changes the profile and supersedes the matching facts", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    await completeOnboarding(deps, actorOf(user), onboarding());
    const profile = await updateProfile(deps, actorOf(user), {
      county: "Travis",
      gpaUnweighted: 3.9,
      displayName: "Maya R.",
    });
    expect(profile).toMatchObject({ county: "Travis", gpaUnweighted: 3.9 });
    const counties = (await listFacts(deps, actorOf(user), user.id)).filter((f) => f.key === "county");
    expect(counties.map((f) => f.value)).toEqual(["Travis"]);
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.displayName).toBe("Maya R.");
  });

  it("getProfile is for the owner and system only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    expect((await getProfile(deps, SYSTEM, user.id)).gpaUnweighted).toBe(3.72);
    await expect(getProfile(deps, actorOf(other), user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("getAutofillProfile returns the profile and activities in order", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db, { email: "maya@example.test" });
    await deps.db.insert(activities).values([
      { ownerId: user.id, position: 2, name: "Tutoring" },
      { ownerId: user.id, position: 1, name: "Robotics team", role: "Captain", hoursPerWeek: 6, grades: [10, 11] },
    ]);
    const autofill = await getAutofillProfile(deps, actorOf(user));
    expect(autofill).toMatchObject({
      email: "maya@example.test",
      highSchool: "Maple High School",
      gpa: 3.72,
      state: "TX",
    });
    expect(autofill.activities.map((a) => a.name)).toEqual(["Robotics team", "Tutoring"]);
    expect(autofill.activities[0]).toMatchObject({ role: "Captain", hoursPerWeek: 6, grades: [10, 11] });
  });
});

describe("onboarding claim", () => {
  it("creates starter jobs only once under concurrent completion", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    const results = await Promise.allSettled([
      completeOnboarding(deps, actorOf(user), onboarding()),
      completeOnboarding(deps, actorOf(user), onboarding()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure && failure.status === "rejected" ? failure.reason : null).toMatchObject({ code: "conflict" });
    expect(deps.jobs.sent.filter((job) => job.name === "plan.weekly")).toHaveLength(1);
    expect(deps.jobs.sent.filter((job) => job.name === "sweep.student")).toHaveLength(1);
  });
});
