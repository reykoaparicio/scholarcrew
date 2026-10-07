import type {
  Activity,
  AidChecklist,
  ApplicationItem,
  College,
  CollegeListEntry,
  ContextSnapshot,
  CostSummary,
  Deadline,
  EssayWithBody,
  Match,
  OfferComparison,
  PlanItem,
  RequirementProgress,
  ScholarshipDetail,
  ScholarshipSummary,
  Story,
  TestScore,
  WeekPlan,
} from "@scholarcrew/domain";
import type { CrewDataPort } from "../context/port";

/** Fixed IDs for the fictional sample student from the mockups. */
export const JORDAN = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  factId: "22222222-2222-4222-8222-222222222201",
  majorFactId: "22222222-2222-4222-8222-222222222202",
  decisionId: "33333333-3333-4333-8333-333333333301",
  planItemId: "44444444-4444-4444-8444-444444444401",
  scholarshipId: "55555555-5555-4555-8555-555555555501",
  collegeId: "228778",
  collegeEntryId: "66666666-6666-4666-8666-666666666601",
  storyId: "77777777-7777-4777-8777-777777777701",
  essayId: "88888888-8888-4888-8888-888888888801",
  testScoreId: "99999999-9999-4999-8999-999999999901",
  scholarshipSourceUrl: "https://example.org/hill-country-stem",
  scholarshipVerifiedAt: "2026-10-02T15:00:00.000Z",
  collegeSourceUrl: "https://example.org/utexas-cost",
  collegeVerifiedAt: "2026-09-15T15:00:00.000Z",
} as const;

const CREATED = "2026-09-01T15:00:00.000Z";

export interface FakePortData {
  snapshot: ContextSnapshot;
  matches: Match[];
  scholarships: ScholarshipDetail[];
  colleges: College[];
  collegeList: CollegeListEntry[];
  applicationItems: ApplicationItem[];
  stories: Story[];
  essays: EssayWithBody[];
  costs: CostSummary[];
  offers: OfferComparison;
  aidChecklist: AidChecklist[];
  testScores: TestScore[];
  activities: Activity[];
  serviceProgress: RequirementProgress[];
  weekPlan: WeekPlan;
  deadlines: Deadline[];
}

function toSummary(s: ScholarshipDetail): ScholarshipSummary {
  const county = s.localArea.counties[0];
  const localLabel = s.localArea.national
    ? "National"
    : [county ? `${county} County` : null, s.localArea.state].filter((p) => p !== null).join(", ");
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    provider: s.provider,
    amountMinUsd: s.amountMinUsd,
    amountMaxUsd: s.amountMaxUsd,
    renewable: s.renewable,
    deadline: s.deadline,
    localLabel,
    status: s.status,
    verifiedAt: s.verifiedAt,
    scamFlags: s.scamFlags,
    unverified: s.verifiedAt === null,
    estMinutes: s.estMinutes,
  };
}

/** Fresh sample data on every call, so tests can't leak changes into each other. */
export function jordanData(): FakePortData {
  const planItem: PlanItem = {
    id: JORDAN.planItemId,
    weekStart: "2026-10-05",
    title: "Outline the Hill Country STEM essay",
    kind: "scholarship",
    refType: "scholarship",
    refId: JORDAN.scholarshipId,
    minutes: 30,
    valueUsd: 1000,
    dueOn: "2026-10-15",
    status: "todo",
    contributors: ["scout", "quill"],
    priority: 1,
    createdAt: CREATED,
    completedAt: null,
  };
  const weekPlan: WeekPlan = { weekStart: "2026-10-05", items: [planItem], totalMinutes: 30, doneCount: 0 };
  const deadlines: Deadline[] = [
    {
      kind: "scholarship",
      title: "Hill Country STEM Award",
      dueOn: "2026-10-15",
      daysLeft: 9,
      refType: "scholarship",
      refId: JORDAN.scholarshipId,
      valueUsd: 1000,
      warning: true,
    },
  ];
  const scholarship: ScholarshipDetail = {
    id: JORDAN.scholarshipId,
    slug: "hill-country-stem-award",
    name: "Hill Country STEM Award",
    provider: "Hill Country Community Foundation",
    url: JORDAN.scholarshipSourceUrl,
    sourceUrl: JORDAN.scholarshipSourceUrl,
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    renewable: false,
    renewalTerms: "",
    deadline: "2026-10-15",
    cycle: "2026-27",
    localArea: { national: false, state: "TX", counties: ["Travis"], cities: [] },
    eligibility: [{ type: "county_in", state: "TX", counties: ["Travis"] }],
    requirements: {
      essays: [{ prompt: "Tell us about a STEM project you led.", wordLimit: 500 }],
      recommendations: 1,
      transcript: true,
      serviceHours: null,
      other: [],
    },
    status: "published",
    visibility: "public",
    submittedById: null,
    scamFlags: [],
    estMinutes: 90,
    verifiedAt: JORDAN.scholarshipVerifiedAt,
    createdAt: CREATED,
    updatedAt: CREATED,
    application: null,
    stale: false,
  };
  const college: College = {
    id: JORDAN.collegeId,
    name: "The University of Texas at Austin",
    state: "TX",
    city: "Austin",
    control: "public",
    admitRate: 0.29,
    costOfAttendanceUsd: 31_000,
    netPriceByIncome: {
      overall: 17_000,
      under_30k: 6000,
      "30_48k": 9000,
      "48_75k": 14_000,
      "75_110k": 21_000,
      over_110k: 27_000,
    },
    testPolicy: "optional",
    superscore: true,
    cssProfileRequired: false,
    outsidePolicy: "reduces_loans_first",
    meritTiers: [],
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [],
      teacherRecs: 0,
      counselorRec: false,
      applicationFeeUsd: 75,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2026-12-01",
    sourceUrl: JORDAN.collegeSourceUrl,
    verifiedAt: JORDAN.collegeVerifiedAt,
  };
  const snapshot: ContextSnapshot = {
    privateMatchCount: 0,
    ownerId: JORDAN.ownerId,
    displayName: "Jordan",
    today: "2026-10-06",
    timeZone: "America/Chicago",
    audience: "crew",
    room: "my_crew",
    roomRef: null,
    profile: {
      classYear: 2027,
      state: "TX",
      county: "Travis",
      gpa: 3.72,
      intendedMajors: ["Computer Science"],
      interests: ["robotics", "tutoring"],
    },
    facts: [
      { id: JORDAN.factId, key: "home_county", value: "Travis County", source: "user_stated" },
      { id: JORDAN.majorFactId, key: "intended_major", value: "Computer Science", source: "user_stated" },
    ],
    decisions: [
      { id: JORDAN.decisionId, summary: "Apply Early Action to UT Austin", decidedAt: "2026-09-20T15:00:00.000Z" },
    ],
    weekPlan,
    deadlines,
    colleges: [{ id: JORDAN.collegeId, name: college.name, fit: "target", plan: "EA" }],
    enabledSpecialists: ["scout", "atlas", "quill", "aid", "ledger", "prep", "impact"],
  };
  return {
    snapshot,
    matches: [
      {
        scholarship: toSummary(scholarship),
        fitScore: 82,
        valuePerHour: 667,
        estMinutes: 90,
        reasons: [{ code: "county", text: "You live in Travis County", sensitive: false }],
        unknowns: [],
        reuseStoryIds: [JORDAN.storyId],
        daysUntilDeadline: 9,
        applicationId: null,
        stage: null,
      },
    ],
    scholarships: [scholarship],
    colleges: [college],
    collegeList: [
      {
        id: JORDAN.collegeEntryId,
        collegeId: JORDAN.collegeId,
        college: {
          id: college.id,
          name: college.name,
          state: college.state,
          city: college.city,
          control: college.control,
          admitRate: college.admitRate,
          costOfAttendanceUsd: college.costOfAttendanceUsd,
          testPolicy: college.testPolicy,
        },
        fit: "target",
        plan: "EA",
        status: "applying",
        season: "2026-27",
        deadline: "2026-11-01",
        itemsDone: 1,
        itemsTotal: 5,
        gapUsd: 9200,
        outsidePolicy: college.outsidePolicy,
        testPolicy: college.testPolicy,
        createdAt: CREATED,
      },
    ],
    applicationItems: [],
    stories: [
      {
        id: JORDAN.storyId,
        title: "Robotics team rebuild",
        moment: "Our robot failed at regionals and I led the rebuild in two weeks.",
        themes: ["leadership", "persistence"],
        evidence: "",
        summary: "Led the rebuild after the robot failed at regionals.",
        createdAt: CREATED,
        updatedAt: CREATED,
        archivedAt: null,
        uses: [],
      },
    ],
    essays: [
      {
        id: JORDAN.essayId,
        title: "Hill Country STEM essay",
        prompt: "Tell us about a STEM project you led.",
        wordLimit: 500,
        charLimit: null,
        targetType: "scholarship",
        targetCollegeId: null,
        targetScholarshipId: JORDAN.scholarshipId,
        currentVersion: 1,
        status: "drafting",
        createdAt: CREATED,
        updatedAt: CREATED,
        body: "When our robot died at regionals, I learned that a team can rebuild faster than it can blame.",
        wordCount: 18,
        latestWordCount: 18,
        comments: [],
        targetLabel: "Hill Country STEM Award",
      },
    ],
    costs: [
      {
        collegeId: JORDAN.collegeId,
        collegeName: college.name,
        source: "scorecard",
        sourceLabel: "College Scorecard estimate",
        costOfAttendanceUsd: 31_000,
        freeMoneyUsd: 21_800,
        gapUsd: 9200,
        pendingUsd: 1000,
        gapIfPendingWinUsd: 8200,
        isEstimate: true,
        budgetUsd: null,
        gapAfterBudgetUsd: null,
      },
    ],
    offers: { columns: [], lowestFourYearOfferId: null, assumptions: [] },
    aidChecklist: [],
    testScores: [
      {
        id: JORDAN.testScoreId,
        test: "ACT",
        takenOn: "2026-06-13",
        official: true,
        composite: 29,
        sections: { english: 30, math: 28, reading: 30, science: 28 },
        createdAt: CREATED,
      },
    ],
    activities: [],
    serviceProgress: [],
    weekPlan,
    deadlines,
  };
}

export function createFakePort(o: Partial<FakePortData> = {}): CrewDataPort & { calls: string[]; data: FakePortData } {
  const data: FakePortData = { ...jordanData(), ...o };
  const calls: string[] = [];
  const log = (name: string): void => {
    calls.push(name);
  };
  return {
    calls,
    data,
    async liveGrants() {
      return ["deadlines", "scholarships", "colleges", "costs", "activities"];
    },
    usedCategories() {
      return [];
    },
    async snapshot(ownerId, room, audience) {
      log(`snapshot:${room}:${audience}`);
      const privateIds = new Set(
        data.matches
          .filter((match) => match.reasons.some((reason) => reason.sensitive))
          .map((match) => match.scholarship.id),
      );
      const publicRef = (item: { refType: string | null; refId: string | null }) =>
        item.refType !== "scholarship" || item.refId === null || !privateIds.has(item.refId);
      return {
        ...data.snapshot,
        ownerId,
        room,
        audience,
        privateMatchCount: privateIds.size,
        deadlines: data.snapshot.deadlines.filter(publicRef),
        weekPlan: { ...data.snapshot.weekPlan, items: data.snapshot.weekPlan.items.filter(publicRef) },
      };
    },
    async matches(_ownerId, audience) {
      log(`matches:${audience}`);
      const matches = data.matches.filter((match) => !match.reasons.some((reason) => reason.sensitive));
      return { matches, privateCount: data.matches.length - matches.length };
    },
    async searchScholarships(q) {
      log("searchScholarships");
      const needle = (q.q ?? "").toLowerCase();
      return data.scholarships
        .filter(
          (s) =>
            s.name.toLowerCase().includes(needle) &&
            !data.matches.some(
              (match) => match.scholarship.id === s.id && match.reasons.some((reason) => reason.sensitive),
            ),
        )
        .map(toSummary);
    },
    async scholarship(idOrSlug) {
      log(`scholarship:${idOrSlug}`);
      return (
        data.scholarships.find(
          (s) =>
            (s.id === idOrSlug || s.slug === idOrSlug) &&
            !data.matches.some(
              (match) => match.scholarship.id === s.id && match.reasons.some((reason) => reason.sensitive),
            ),
        ) ?? null
      );
    },
    async collegeList() {
      log("collegeList");
      return data.collegeList;
    },
    async college(id) {
      log(`college:${id}`);
      return data.colleges.find((c) => c.id === id) ?? null;
    },
    async applicationItems() {
      log("applicationItems");
      return data.applicationItems;
    },
    async stories() {
      log("stories");
      return data.stories;
    },
    async story(_ownerId, storyId) {
      log(`story:${storyId}`);
      return data.stories.find((story) => story.id === storyId && story.archivedAt === null) ?? null;
    },
    async essay(_ownerId, essayId) {
      log(`essay:${essayId}`);
      return data.essays.find((e) => e.id === essayId) ?? null;
    },
    async costs() {
      log("costs");
      return data.costs;
    },
    async offers() {
      log("offers");
      return data.offers;
    },
    async aidChecklist() {
      log("aidChecklist");
      return data.aidChecklist;
    },
    async testScores() {
      log("testScores");
      return data.testScores;
    },
    async activities() {
      log("activities");
      return data.activities;
    },
    async serviceProgress() {
      log("serviceProgress");
      return data.serviceProgress;
    },
    async weekPlan() {
      log("weekPlan");
      return data.weekPlan;
    },
    async deadlines() {
      log("deadlines");
      return data.deadlines;
    },
  };
}
