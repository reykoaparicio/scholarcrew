import type { MeResponse, MemoryFact } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  activeKeyFor,
  enabledOptionalCrew,
  mobileTabsFor,
  navFor,
  onboardingRedirect,
  rosterFor,
  sharedCategoriesOf,
  userCard,
} from "./nav";

const me = (
  o: { role?: "student" | "parent"; name?: string; classYear?: number | null; family?: boolean } = {},
): MeResponse => ({
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "maya.r@example.test",
    displayName: o.name ?? "Maya R.",
    role: o.role ?? "student",
    birthYear: 2009,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile:
    o.role === "parent"
      ? null
      : {
          userId: "11111111-1111-4111-8111-111111111111",
          classYear: o.classYear === undefined ? 2027 : o.classYear,
          highSchool: "Maple High School",
          state: "TX",
          county: "Maple",
          city: "",
          gpaUnweighted: 3.72,
          gpaWeighted: null,
          intendedMajors: [],
          interests: [],
          onboardingCompletedAt: "2026-10-01T15:00:00.000Z",
          updatedAt: "2026-10-01T15:00:00.000Z",
        },
  onboardingComplete: true,
  family: o.family ? { id: "22222222-2222-4222-8222-222222222222", role: o.role ?? "student" } : null,
  plan: "free",
});

const fact = (key: string, value: MemoryFact["value"], status: MemoryFact["status"] = "confirmed"): MemoryFact => ({
  id: "33333333-3333-4333-8333-333333333333",
  key,
  value,
  valueText: String(value),
  source: "user_stated",
  sourceRef: null,
  visibility: "crew",
  status,
  createdAt: "2026-10-01T15:00:00.000Z",
  confirmedAt: null,
  expiresAt: null,
});

describe("navFor", () => {
  it("gives students the eight mockup items in order", () => {
    expect(navFor("student").map((i) => i.label)).toEqual([
      "This week",
      "Crew",
      "Scholarships",
      "Essays",
      "Colleges",
      "Money",
      "Family",
      "Memory",
    ]);
    expect(navFor("student")[0]).toEqual({ key: "week", label: "This week", href: "/week", icon: "calendar" });
  });

  it("adds switched-on teammates after Colleges", () => {
    expect(navFor("student", ["prep", "impact"]).map((i) => i.key)).toEqual([
      "week",
      "crew",
      "scholarships",
      "essays",
      "colleges",
      "prep",
      "impact",
      "money",
      "family",
      "memory",
    ]);
  });

  it("gives parents the reduced nav with the family room as Crew chats", () => {
    expect(navFor("parent", ["prep"]).map((i) => i.key)).toEqual(["week", "crew", "colleges", "money", "family"]);
    expect(navFor("parent").find((i) => i.key === "crew")).toEqual({
      key: "crew",
      label: "Crew chats",
      href: "/crew",
      icon: "chat",
    });
  });

  it("adds the screens a student shares to the parent nav (E-16-2)", () => {
    const shared = sharedCategoriesOf({
      studentId: "11111111-1111-4111-8111-111111111111",
      familyId: "22222222-2222-4222-8222-222222222222",
      categories: {
        deadlines: true,
        colleges: true,
        costs: true,
        scholarships: true,
        activities: true,
        essays: false,
        chats: false,
        stories: true,
        sensitive: false,
      },
    });
    expect(shared).toEqual(["deadlines", "colleges", "costs", "scholarships", "activities", "stories"]);
    expect(sharedCategoriesOf(null)).toEqual([]);
    const nav = navFor("parent", [], shared);
    expect(nav.map((i) => [i.key, i.label, i.href])).toEqual([
      ["week", "This week", "/week"],
      ["crew", "Crew chats", "/crew"],
      ["scholarships", "Scholarships", "/scholarships"],
      ["essays", "Story Bank", "/essays/stories"],
      ["colleges", "Colleges", "/colleges"],
      ["impact", "Service", "/impact"],
      ["money", "Money", "/money"],
      ["family", "Family", "/family"],
    ]);
    expect(navFor("parent", [], ["essays", "stories"]).find((i) => i.key === "essays")).toMatchObject({
      label: "Essays",
      href: "/essays",
    });
    expect(navFor("student", [], ["chats"]).map((i) => i.key)).toEqual(navFor("student").map((i) => i.key));
  });
});

describe("activeKeyFor", () => {
  it("uses the first path segment", () => {
    expect(activeKeyFor("/week")).toBe("week");
    expect(activeKeyFor("/crew/abc")).toBe("crew");
    expect(activeKeyFor("/essays/stories")).toBe("essays");
    expect(activeKeyFor("/settings")).toBe("settings");
    expect(activeKeyFor("/")).toBe("");
    expect(activeKeyFor("/weekly")).toBe("");
  });
});

describe("mobileTabsFor", () => {
  it("puts four tabs up front and the rest under More", () => {
    const student = mobileTabsFor("student", []);
    expect(student.tabs.map((t) => t.key)).toEqual(["week", "crew", "scholarships", "essays"]);
    expect(student.more.map((t) => t.key)).toEqual(["colleges", "money", "family", "memory", "settings"]);
    const parent = mobileTabsFor("parent", []);
    expect(parent.tabs.map((t) => t.key)).toEqual(["week", "crew", "colleges", "money"]);
    expect(parent.more.map((t) => t.key)).toEqual(["family", "settings"]);
    const sharing = mobileTabsFor("parent", [], ["scholarships", "activities"]);
    expect(sharing.tabs.map((t) => t.key)).toEqual(["week", "crew", "scholarships", "colleges"]);
    expect(sharing.more.map((t) => t.key)).toEqual(["impact", "money", "family", "settings"]);
  });
});

describe("crew roster", () => {
  it("shows Prep and Impact as add until switched on", () => {
    const roster = rosterFor([]);
    expect(roster.map((r) => r.role)).toEqual([
      "compass",
      "scout",
      "atlas",
      "quill",
      "aid",
      "ledger",
      "prep",
      "impact",
    ]);
    expect(roster.filter((r) => !r.enabled).map((r) => [r.role, r.addHref])).toEqual([
      ["prep", "/crew#add-teammate"],
      ["impact", "/crew#add-teammate"],
    ]);
    expect(rosterFor(["impact"]).find((r) => r.role === "impact")?.enabled).toBe(true);
    expect(
      rosterFor([], "parent")
        .filter((r) => !r.enabled)
        .map((r) => r.addHref),
    ).toEqual([undefined, undefined]);
  });

  it("reads switches from confirmed true facts only", () => {
    expect(
      enabledOptionalCrew([
        fact("crew_prep_enabled", true),
        fact("crew_impact_enabled", false),
        fact("crew_impact_enabled", true, "candidate"),
        fact("county", "Maple"),
      ]),
    ).toEqual(["prep"]);
  });
});

describe("userCard", () => {
  it("matches the sidebar card", () => {
    expect(userCard(me())).toEqual({ name: "Maya R.", subtitle: "Class of 2027 · Private" });
    expect(userCard(me({ classYear: null }))).toEqual({ name: "Maya R.", subtitle: "Student · Private" });
    expect(userCard(me({ role: "parent", name: "", family: true }))).toEqual({
      name: "maya.r",
      subtitle: "Parent · Family",
    });
  });
});

describe("onboardingRedirect", () => {
  it("sends unfinished students to onboarding from anywhere else", () => {
    const unfinished = { role: "student" as const, onboardingComplete: false };
    expect(onboardingRedirect(unfinished, "/week")).toBe("/onboarding");
    expect(onboardingRedirect(unfinished, "/crew/abc")).toBe("/onboarding");
    expect(onboardingRedirect(unfinished, "/onboarding")).toBeNull();
    expect(onboardingRedirect(unfinished, "/onboarding/step")).toBeNull();
    expect(onboardingRedirect(unfinished, "/onboardingx")).toBe("/onboarding");
  });

  it("leaves finished students and parents alone", () => {
    expect(onboardingRedirect({ role: "student", onboardingComplete: true }, "/week")).toBeNull();
    expect(onboardingRedirect({ role: "parent", onboardingComplete: false }, "/week")).toBeNull();
  });
});
