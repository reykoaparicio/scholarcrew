import { describe, expect, it } from "vitest";
import { Essay, EssayPatch, QuillCommentDraft, SaveVersionInput } from "./essays";
import { ActivityInput, ServiceLog, ServiceLogInput } from "./impact";
import { TestScoreInput } from "./prep";

const activity = {
  position: 1,
  name: "Robotics team",
  role: "Build lead",
  organization: "Maple High",
  description: "Lead a 12-person build team; run monthly STEM nights for elementary students at the public library.",
  hoursPerWeek: 8,
  weeksPerYear: 30,
  grades: [10, 11, 12],
  category: "STEM",
};

describe("ActivityInput", () => {
  it("allows 150 characters counted as code points", () => {
    expect(ActivityInput.safeParse({ ...activity, description: "é".repeat(150) }).success).toBe(true);
    expect(ActivityInput.safeParse({ ...activity, description: "é".repeat(151) }).success).toBe(false);
  });

  it("limits positions to 1..10", () => {
    expect(ActivityInput.safeParse({ ...activity, position: 11 }).success).toBe(false);
  });
});

describe("ServiceLogInput", () => {
  it("allows an empty supervisor email and caps minutes at one day", () => {
    const base = { organization: "Library", activity: "STEM night", servedOn: "2026-09-12", minutes: 120 };
    expect(ServiceLogInput.parse(base).supervisorEmail).toBe("");
    expect(ServiceLogInput.safeParse({ ...base, minutes: 1441 }).success).toBe(false);
  });
});

describe("ServiceLog", () => {
  it("carries the supervisor link expiry, null or a timestamp (R2P-10)", () => {
    const log = {
      id: "00000000-0000-4000-8000-000000000000",
      organization: "Library",
      activity: "STEM night",
      servedOn: "2026-09-12",
      minutes: 120,
      supervisorName: "Ms. Ruiz",
      supervisorEmail: "ruiz@example.org",
      verification: "self_reported",
      verificationExpiresAt: null,
      verifiedAt: null,
      verifierNote: "",
      reflection: "",
      createdAt: "2026-09-12T20:00:00.000Z",
    };
    expect(ServiceLog.safeParse(log).success).toBe(true);
    expect(
      ServiceLog.safeParse({ ...log, verification: "requested", verificationExpiresAt: "2026-09-26T20:00:00.000Z" })
        .success,
    ).toBe(true);
    const { verificationExpiresAt: _omit, ...missing } = log;
    expect(ServiceLog.safeParse(missing).success).toBe(false);
  });
});

describe("TestScoreInput", () => {
  it("checks the composite range per test", () => {
    const base = { takenOn: "2026-09-12", official: true, sections: {} };
    expect(TestScoreInput.safeParse({ ...base, test: "ACT", composite: 27 }).success).toBe(true);
    expect(TestScoreInput.safeParse({ ...base, test: "ACT", composite: 37 }).success).toBe(false);
    expect(TestScoreInput.safeParse({ ...base, test: "SAT", composite: 1350 }).success).toBe(true);
    expect(TestScoreInput.safeParse({ ...base, test: "SAT", composite: 300 }).success).toBe(false);
  });
});

describe("essay inputs", () => {
  it("requires a base version for optimistic saves", () => {
    expect(SaveVersionInput.safeParse({ body: "Hi" }).success).toBe(false);
    expect(SaveVersionInput.safeParse({ body: "Hi", baseVersion: 0 }).success).toBe(true);
  });

  it("bounds Quill comment drafts", () => {
    expect(
      QuillCommentDraft.safeParse({
        quote: "30 kids came",
        occurrence: 1,
        kind: "question",
        body: "What changed for one kid?",
      }).success,
    ).toBe(true);
    expect(QuillCommentDraft.safeParse({ quote: "", occurrence: 1, kind: "question", body: "x" }).success).toBe(false);
  });

  it("carries the latest word count, null before the first save (D34)", () => {
    const essay = {
      id: "00000000-0000-4000-8000-000000000000",
      title: "Why nursing",
      prompt: "Why this major?",
      wordLimit: 650,
      charLimit: null,
      targetType: "general",
      targetCollegeId: null,
      targetScholarshipId: null,
      currentVersion: 0,
      latestWordCount: null,
      status: "drafting",
      createdAt: "2026-10-06T15:00:00.000Z",
      updatedAt: "2026-10-06T15:00:00.000Z",
    };
    expect(Essay.safeParse(essay).success).toBe(true);
    expect(Essay.safeParse({ ...essay, currentVersion: 2, latestWordCount: 412 }).success).toBe(true);
    expect(Essay.safeParse({ ...essay, latestWordCount: -1 }).success).toBe(false);
    expect(Essay.safeParse({ ...essay, latestWordCount: undefined }).success).toBe(false);
  });

  it("requires at least one key in an essay patch (R2P-14)", () => {
    expect(EssayPatch.safeParse({}).success).toBe(false);
    expect(EssayPatch.safeParse({ status: "ready" }).success).toBe(true);
    expect(EssayPatch.safeParse({ title: "Why nursing, take two" }).success).toBe(true);
    expect(EssayPatch.safeParse({ title: "" }).success).toBe(false);
    expect(EssayPatch.safeParse({ status: "done" }).success).toBe(false);
    expect(EssayPatch.safeParse({ wordLimit: 500 }).success).toBe(false);
  });
});
