import type { CollegeListEntry, CostSummary, HelperLink, MeritTier, RecRequest } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  checklistLabel,
  limitMessage,
  listBalance,
  meritRows,
  outsidePolicyView,
  pastRequests,
  testPolicyLabel,
  withGaps,
} from "./colleges";

const entry = (o: Partial<CollegeListEntry> & { name: string }): CollegeListEntry => ({
  id: `id-${o.name}`,
  collegeId: `c-${o.name}`,
  college: {
    id: `c-${o.name}`,
    name: o.name,
    state: "TX",
    city: "Austin",
    control: "public",
    admitRate: 0.5,
    costOfAttendanceUsd: 27800,
    testPolicy: "optional",
  },
  fit: "target",
  plan: "EA",
  status: "researching",
  season: "2026-27",
  deadline: "2026-11-01",
  itemsDone: 3,
  itemsTotal: 5,
  gapUsd: null,
  outsidePolicy: "added_on_top",
  testPolicy: "optional",
  createdAt: "2026-10-01T15:00:00.000Z",
  ...o,
});

describe("college labels", () => {
  it("labels checklist progress, test policy, and outside scholarship policy", () => {
    expect(checklistLabel(3, 5)).toBe("3 of 5");
    expect(checklistLabel(4, 4)).toBe("Done");
    expect(checklistLabel(0, 0)).toBe("No items");
    expect(testPolicyLabel("blind", true)).toBe("Not used");
    expect(testPolicyLabel("required", true)).toBe("Required · superscores");
    expect(testPolicyLabel("optional", null)).toBe("Optional");
    expect(outsidePolicyView("added_on_top")).toEqual({
      icon: "check",
      tone: "good",
      text: "Added on top of your aid",
    });
    expect(outsidePolicyView("may_reduce_grant")).toMatchObject({ icon: "alert", tone: "warn" });
    expect(outsidePolicyView("unknown")).toMatchObject({ icon: "info", text: "Unconfirmed: ask the aid office" });
  });

  it("shows the 25-school limit", () => {
    expect(limitMessage(24)).toBeNull();
    expect(limitMessage(25)).toBe("Your list has 25 schools, the most it can hold. Remove one to add another.");
  });
});

describe("withGaps and listBalance", () => {
  it("fills each entry's gap from the money costs", () => {
    const costs = [{ collegeId: "c-State U", gapUsd: 9200 } as CostSummary];
    expect(withGaps([entry({ name: "State U" }), entry({ name: "Bay Tech" })], costs).map((e) => e.gapUsd)).toEqual([
      9200,
      null,
    ]);
  });

  it("describes balance and grant displacement risks (CO-08)", () => {
    expect(
      listBalance([
        entry({ name: "State U" }),
        entry({ name: "Riverside", fit: "likely" }),
        entry({ name: "Bay Tech", outsidePolicy: "may_reduce_grant" }),
        entry({ name: "Northgate", fit: "reach" }),
      ]),
    ).toEqual([
      "Your list: 1 likely, 2 target, 1 reach.",
      "Bay Tech may lower its own grant if you win outside scholarships. Ask its aid office before counting on outside money there.",
    ]);
    expect(listBalance([entry({ name: "Northgate", fit: "reach" })])).toEqual([
      "Your list: 0 likely, 0 target, 1 reach.",
      "Add a likely school so you have a sure option.",
    ]);
    expect(listBalance([])).toEqual([]);
  });
});

describe("meritRows (CO-06)", () => {
  const tiers: MeritTier[] = [
    { label: "Dean's", minGpa: 3.5, minAct: 30, minSat: null, annualUsd: 5000, renewalGpa: 3.0 },
    { label: "Merit", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3.0 },
  ];
  it("marks the tier the student qualifies for now", () => {
    expect(meritRows(tiers, 3.72, 27, null)).toEqual([
      { label: "Dean's", text: "$5,000/yr · GPA 3.5+, ACT 30+ · renews at 3.0", qualifies: false },
      { label: "Merit", text: "$3,000/yr · GPA 3.5+ · renews at 3.0", qualifies: true },
    ]);
    expect(meritRows([], 3.72, 27, null)).toEqual([]);
  });
});

describe("pastRequests (CO-07, D33)", () => {
  const request = (id: string, o: Partial<RecRequest> = {}): RecRequest => ({
    id,
    recommenderId: "r1",
    collegeListId: "e1",
    scholarshipApplicationId: null,
    helperLinkId: null,
    status: "requested",
    requestedAt: "2026-10-01T15:00:00.000Z",
    updatedAt: "2026-10-01T15:00:00.000Z",
    ...o,
  });
  const link = (id: string, o: Partial<HelperLink> = {}): HelperLink => ({
    id,
    label: "Letter for State U",
    helperRole: "recommender",
    scope: ["activities", "stories"],
    createdAt: "2026-10-01T15:00:00.000Z",
    expiresAt: "2026-10-31T15:00:00.000Z",
    revokedAt: null,
    lastUsedAt: null,
    ...o,
  });

  it("keeps this entry's requests in list order and matches each helper link by helperLinkId", () => {
    const rows = pastRequests(
      [
        request("q3", { helperLinkId: "h3", status: "confirmed" }),
        request("q2", { helperLinkId: "h2", recommenderId: "gone" }),
        request("q1", { helperLinkId: "h1" }),
        request("q0", { collegeListId: "other" }),
        request("q4", { helperLinkId: "missing" }),
      ],
      [
        link("h1", { expiresAt: "2026-10-05T15:00:00.000Z" }),
        link("h2", { revokedAt: "2026-10-02T15:00:00.000Z" }),
        link("h3"),
      ],
      [
        {
          id: "r1",
          name: "Mr. Okafor",
          email: "okafor@school.example.org",
          relationship: "Counselor",
          createdAt: "2026-09-01T15:00:00.000Z",
        },
      ],
      "e1",
      new Date("2026-10-06T15:00:00.000Z"),
    );
    expect(rows.map((r) => [r.id, r.recommenderName, r.status, r.link?.state ?? null])).toEqual([
      ["q3", "Mr. Okafor", "confirmed", "active"],
      ["q2", "A recommender", "requested", "revoked"],
      ["q1", "Mr. Okafor", "requested", "expired"],
      ["q4", "Mr. Okafor", "requested", null],
    ]);
    expect(rows[0]?.link?.expiresAt).toBe("2026-10-31T15:00:00.000Z");
  });
});
