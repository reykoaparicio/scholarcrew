import { describe, expect, it } from "vitest";
import { ActionCard, CrewReply, CrewRequestInput, SpecialistResult, ThisWeekView } from "./crew";
import { HelperView } from "./helpers";

const reply = {
  text: "Start with the Hill Country STEM Award.",
  contributors: ["compass", "scout", "quill"],
  question: null,
  actionCards: [
    {
      kind: "add_plan_item",
      id: "hill-country",
      label: "Add to my weekend",
      item: {
        title: "Hill Country STEM Award",
        kind: "scholarship",
        refType: "scholarship",
        refId: null,
        minutes: 30,
        valueUsd: 1000,
        dueOn: "2026-10-15",
        contributors: ["scout"],
        weekStart: null,
      },
    },
  ],
  receipt: [
    {
      kind: "catalog",
      label: "Hill Country listing",
      refId: null,
      sourceUrl: "https://example.org/hc",
      verifiedAt: "2026-10-02T15:00:00.000Z",
    },
  ],
  safety: null,
  needsInput: false,
};

describe("CrewReply", () => {
  it("parses a full reply", () => {
    expect(CrewReply.parse(reply).actionCards).toHaveLength(1);
  });

  it("rejects unknown keys and more than 4 action cards", () => {
    expect(CrewReply.safeParse({ ...reply, extra: 1 }).success).toBe(false);
    const cards = Array.from({ length: 5 }, (_, i) => ({
      kind: "open_link",
      id: `c${i}`,
      label: "Open",
      href: "/week",
    }));
    expect(CrewReply.safeParse({ ...reply, actionCards: cards }).success).toBe(false);
  });

  it("requires at least one contributor", () => {
    expect(CrewReply.safeParse({ ...reply, contributors: [] }).success).toBe(false);
  });
});

describe("ActionCard", () => {
  it("only allows internal links", () => {
    expect(
      ActionCard.safeParse({ kind: "open_link", id: "a", label: "Open", href: "/scholarships/rotary" }).success,
    ).toBe(true);
    expect(
      ActionCard.safeParse({ kind: "open_link", id: "a", label: "Open", href: "https://evil.example" }).success,
    ).toBe(false);
    expect(ActionCard.safeParse({ kind: "open_link", id: "a", label: "Open", href: "//evil.example" }).success).toBe(
      false,
    );
  });

  it("restricts card ids", () => {
    expect(ActionCard.safeParse({ kind: "open_link", id: "Bad Id!", label: "Open", href: "/week" }).success).toBe(
      false,
    );
  });
});

describe("SpecialistResult", () => {
  it("parses a specialist hand-off", () => {
    const r = SpecialistResult.parse({
      role: "scout",
      summary: "3 matches due within 3 weeks.",
      proposedActions: [
        {
          title: "Hill Country STEM Award",
          minutes: 30,
          dueOn: "2026-10-15",
          valueUsd: 1000,
          refType: "scholarship",
          refId: null,
        },
      ],
      factsUsed: [{ claim: "Deadline Oct 15", source: "catalog", refId: null, verifiedAt: null }],
      uncertainty: [],
      needsPermission: [],
    });
    expect(r.role).toBe("scout");
  });

  it("does not accept compass as a specialist", () => {
    expect(
      SpecialistResult.safeParse({
        role: "compass",
        summary: "",
        proposedActions: [],
        factsUsed: [],
        uncertainty: [],
        needsPermission: [],
      }).success,
    ).toBe(false);
  });
});

describe("ThisWeekView", () => {
  it("allows an empty week", () => {
    expect(
      ThisWeekView.safeParse({
        greetingName: "Jordan",
        weekStart: "2026-10-05",
        nextStep: null,
        plan: { weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 },
        gap: null,
        deadlines: [],
        sweep: null,
        crewWorking: true,
      }).success,
    ).toBe(true);
  });
});

describe("HelperView", () => {
  it("always carries the recommendation request note and due date (D38)", () => {
    const view = {
      studentName: "Jordan",
      helperRole: "recommender",
      label: "Recommendation for Ms. Patel",
      expiresAt: "2026-11-05T15:00:00.000Z",
      activities: null,
      stories: [{ title: "STEM nights", summary: "Ran monthly STEM nights at the library." }],
      deadlines: null,
      colleges: null,
      scholarships: null,
      request: { message: "Please mention robotics.", dueDate: "2027-01-15" },
    };
    expect(HelperView.safeParse(view).success).toBe(true);
    expect(HelperView.safeParse({ ...view, request: { message: null, dueDate: null } }).success).toBe(true);
    expect(HelperView.safeParse({ ...view, request: { message: null, dueDate: "Jan 15" } }).success).toBe(false);
    expect(HelperView.safeParse({ ...view, request: undefined }).success).toBe(false);
  });
});

describe("CrewRequestInput", () => {
  const input = {
    jobId: "00000000-0000-4000-8000-000000000000",
    ownerId: "00000000-0000-4000-8000-000000000001",
    conversationId: "00000000-0000-4000-8000-000000000002",
    room: "family",
    roomRef: null,
    audience: "family",
    requester: { role: "parent", firstName: "Maria" },
    userText: "How are things going?",
    history: [
      { author: "user", speaker: "student", text: "I finished the FAFSA." },
      { author: "crew", speaker: "crew", text: "Nice work." },
    ],
    mentions: [],
  };

  it("parses a parent requester and speaker-labeled history (D42, R2C-1)", () => {
    const v = CrewRequestInput.parse(input);
    expect(v.requester).toEqual({ role: "parent", firstName: "Maria" });
    expect(v.history.map((h) => h.speaker)).toEqual(["student", "crew"]);
    expect(CrewRequestInput.safeParse({ ...input, requester: { role: "parent", firstName: "" } }).success).toBe(true);
    expect(CrewRequestInput.safeParse({ ...input, requester: { role: "admin", firstName: "A" } }).success).toBe(false);
    const { requester: _omit, ...noRequester } = input;
    expect(CrewRequestInput.safeParse(noRequester).success).toBe(false);
  });

  it("rejects a history line with no speaker", () => {
    expect(CrewRequestInput.safeParse({ ...input, history: [{ author: "user", text: "Hi" }] }).success).toBe(false);
    expect(
      CrewRequestInput.safeParse({ ...input, history: [{ author: "user", speaker: "helper", text: "Hi" }] }).success,
    ).toBe(false);
  });
});

describe("internal links", () => {
  it("refuses slash and backslash authority tricks", () => {
    for (const href of ["//evil.example", "/\\evil.example", "/\\\\evil.example"]) {
      expect(ActionCard.safeParse({ kind: "open_link", id: "bad", label: "Open", href }).success).toBe(false);
    }
  });
});
