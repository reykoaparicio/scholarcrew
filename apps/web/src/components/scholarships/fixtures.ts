import type { Board, BoardCard, ScholarshipApplication, ScholarshipSummary } from "@scholarcrew/domain";

let n = 0;
function uuid(): string {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function summary(o: Partial<ScholarshipSummary> = {}): ScholarshipSummary {
  return {
    id: uuid(),
    slug: "rotary-club-of-eastside",
    name: "Rotary Club of Eastside",
    provider: "Rotary Club of Eastside",
    amountMinUsd: 2500,
    amountMaxUsd: 2500,
    renewable: false,
    deadline: "2026-10-30",
    localLabel: "Maple County, TX",
    status: "published",
    verifiedAt: "2026-10-02T15:00:00.000Z",
    scamFlags: [],
    unverified: false,
    estMinutes: 45,
    ...o,
  };
}

export function application(o: Partial<ScholarshipApplication> = {}): ScholarshipApplication {
  return {
    id: uuid(),
    scholarshipId: uuid(),
    stage: "matched",
    matchReasons: [{ code: "county", text: "you live in Maple County", sensitive: false }],
    fitScore: 80,
    estMinutes: 45,
    submittedAt: null,
    outcomeUsd: null,
    outcomeRenewable: null,
    outcomeAt: null,
    thankYouSent: false,
    createdAt: "2026-10-01T15:00:00.000Z",
    updatedAt: "2026-10-01T15:00:00.000Z",
    ...o,
  };
}

export function card(
  stage: ScholarshipApplication["stage"],
  s: Partial<ScholarshipSummary> = {},
  o: Partial<BoardCard> = {},
): BoardCard {
  const scholarship = summary(s);
  const app = application({ stage, scholarshipId: scholarship.id });
  return {
    application: app,
    scholarship,
    reasons: app.matchReasons,
    reuseStoryTitle: null,
    progress: null,
    daysUntilDeadline: 24,
    ...o,
  };
}

export function board(o: Partial<Board> = {}): Board {
  return {
    matched: [],
    working: [],
    submitted: [],
    won: [],
    lostOrSkipped: [],
    flagged: [],
    privateCount: 0,
    totals: { inPlayUsd: 0, wonUsd: 0, dueThisMonth: 0 },
    ...o,
  };
}
