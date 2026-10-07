import { CSS_STEPS, type CrewReply, FAFSA_STEPS, type ProgressEvent } from "@scholarcrew/domain";
import type { DbOrTx } from "../client";
import {
  activities,
  aidChecklistItems,
  applicationItems,
  collegeList,
  conversations,
  costEstimates,
  crewJobs,
  decisions,
  essayComments,
  essayVersions,
  essays,
  familyTasks,
  helperLinks,
  memoryFacts,
  messages,
  notifications,
  planItems,
  recRequests,
  recommenders,
  scholarshipApplications,
  serviceLogs,
  stories,
  storyUses,
  sweepRuns,
  testScores,
} from "../schema";
import type { CollegeKey, SeedCatalog } from "./catalog";
import type { SeedPeople } from "./people";
import { SEED_TOKENS, at, daysFromNow, one, sha256Hex } from "./util";

type NewEntry = typeof collegeList.$inferInsert;
type NewItem = typeof applicationItems.$inferInsert;
type NewAidItem = typeof aidChecklistItems.$inferInsert;
type ItemSpec = [kind: NewItem["kind"], label: string, status: NonNullable<NewItem["status"]>];

interface ListSpec {
  college: CollegeKey;
  fit: NewEntry["fit"];
  plan: NewEntry["plan"];
  status: NonNullable<NewEntry["status"]>;
  dueOn: string | null;
  items: ItemSpec[];
}

interface StoryIds {
  roboticsId: string;
  bakeryId: string;
}

interface EssayIds {
  hillCountry: string;
  stateU: string;
  rotary: string;
  library: string;
}

const paragraphs = (...lines: string[]): string => lines.join("\n\n");

const ROTARY_OPENING = [
  "I have always been passionate about robotics. In ninth grade I joined our school's robotics team, and by junior year I was the build lead. But the moment I'm proudest of didn't happen at a competition.",
  "Last spring, our librarian asked if the team could run a STEM night for elementary students. I said yes before I knew what I was signing up for. The first night, 30 kids came, and we had four robots and one extension cord.",
];
/** 79 words. */
const ROTARY_DRAFT_1 = paragraphs(...ROTARY_OPENING);
/** 142 words, the draft in the Essay Studio mockup. */
const ROTARY_DRAFT_2 = paragraphs(
  ...ROTARY_OPENING,
  "We kept going every other Thursday. I learned how to explain a motor controller to a nine-year-old, which is harder than building one. By May, some of the kids were building their own sensors and teaching their parents how they worked.",
  "Robotics taught me engineering, but the library nights taught me that knowing something is only half of it. The other half is",
);
/** 58 words: answer 1 done, answer 2 started. */
const HILL_COUNTRY_DRAFT = paragraphs(
  "Our robotics team's arm kept dropping game pieces, so I rebuilt the gripper with a second servo and a foam pad cut from an old yoga mat. I ran 40 test picks before regionals, and we finished with the best pickup rate in our bracket.",
  "Every other Thursday I help run STEM nights at the Maple Public Library.",
);
/** 57 words. */
const LIBRARY_ESSAY = paragraphs(
  "At 5 a.m. the bakery is quiet except for the mixer. I started working the early shift at sixteen, and the first thing I learned was that bread doesn't wait for you to be ready. Neither do customers. The job taught me to show up early, plan ahead, and own my mistakes when a batch didn't rise.",
);

const COLLEGE_LIST: ListSpec[] = [
  {
    college: "stateU",
    fit: "target",
    plan: "EA",
    status: "applying",
    dueOn: "2026-11-01",
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation · Mr. Okafor", "done"],
      ["supplement", "Supplement · 250 words", "in_progress"],
      ["teacher_rec", "Teacher recommendation · Ms. Patel", "todo"],
    ],
  },
  {
    college: "riverside",
    fit: "likely",
    plan: "rolling",
    status: "submitted",
    dueOn: null,
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation · Mr. Okafor", "done"],
      ["fee_or_waiver", "Fee waiver", "done"],
    ],
  },
  {
    college: "bayTech",
    fit: "target",
    plan: "EA",
    status: "applying",
    dueOn: "2026-11-15",
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation", "todo"],
      ["supplement", "Supplement · 300 words", "todo"],
      ["teacher_rec", "Teacher recommendation", "todo"],
    ],
  },
  {
    college: "northgate",
    fit: "reach",
    plan: "RD",
    status: "applying",
    dueOn: "2027-01-05",
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "todo"],
      ["counselor_rec", "Counselor recommendation", "todo"],
      ["teacher_rec", "Two teacher recommendations", "todo"],
      ["supplement", "Supplement · Why Northgate?", "todo"],
      ["css_profile", "CSS Profile", "todo"],
    ],
  },
  {
    college: "centralState",
    fit: "likely",
    plan: "rolling",
    status: "applying",
    dueOn: null,
    items: [
      ["form", "Application form", "done"],
      ["transcript", "Transcript", "done"],
      ["counselor_rec", "Counselor recommendation", "done"],
      ["fee_or_waiver", "Fee waiver", "done"],
    ],
  },
  {
    college: "lakeshore",
    fit: "reach",
    plan: "RD",
    status: "researching",
    dueOn: "2027-01-15",
    items: [
      ["form", "Application form", "todo"],
      ["transcript", "Transcript", "todo"],
      ["counselor_rec", "Counselor recommendation", "todo"],
      ["teacher_rec", "Teacher recommendation", "todo"],
      ["supplement", "Supplement · 300 words", "todo"],
      ["test_scores", "Send test scores", "todo"],
    ],
  },
];

async function seedMemory(db: DbOrTx, people: SeedPeople): Promise<StoryIds> {
  const ownerId = people.jordanId;
  const oct1 = at("2026-10-01T15:10:00.000Z");
  const guessedAt = at("2026-10-04T18:00:00.000Z");
  const guessExpires = at("2026-11-03T18:00:00.000Z");
  await db.insert(memoryFacts).values([
    { ownerId, key: "class_year", value: 2027, source: "user_stated", createdAt: oct1, confirmedAt: oct1 },
    {
      ownerId,
      key: "high_school",
      value: "Maple High School",
      source: "user_stated",
      createdAt: oct1,
      confirmedAt: oct1,
    },
    {
      ownerId,
      key: "gpa_unweighted",
      value: 3.72,
      source: "document",
      sourceRef: "transcript upload",
      createdAt: at("2026-09-12T20:00:00.000Z"),
      confirmedAt: at("2026-09-12T20:00:00.000Z"),
    },
    {
      ownerId,
      key: "act_composite",
      value: 27,
      source: "document",
      sourceRef: "score report",
      visibility: "crew_family",
      createdAt: at("2026-09-30T15:00:00.000Z"),
      confirmedAt: at("2026-09-30T15:00:00.000Z"),
    },
    {
      ownerId,
      key: "intended_major",
      value: "mechanical engineering",
      source: "user_stated",
      sourceRef: "crew message",
      createdAt: at("2026-10-02T23:00:00.000Z"),
      confirmedAt: at("2026-10-02T23:00:00.000Z"),
    },
    {
      ownerId,
      key: "home_county",
      value: "Maple",
      source: "user_stated",
      visibility: "scout_only",
      createdAt: oct1,
      confirmedAt: oct1,
    },
    {
      ownerId,
      key: "parent_employer",
      value: "Maple County Schools",
      source: "parent_shared",
      sourceRef: people.danaId,
      visibility: "scout_only",
      createdAt: at("2026-10-03T01:30:00.000Z"),
      confirmedAt: at("2026-10-03T01:30:00.000Z"),
    },
    {
      ownerId,
      key: "possible_major",
      value: "nursing",
      source: "crew_inferred",
      status: "candidate",
      createdAt: guessedAt,
      expiresAt: guessExpires,
    },
    {
      ownerId,
      key: "distance_preference",
      value: "within 3 hours of home",
      source: "crew_inferred",
      status: "candidate",
      createdAt: guessedAt,
      expiresAt: guessExpires,
    },
  ]);

  await db.insert(decisions).values([
    {
      ownerId,
      summary: "Skip Early Decision at Northgate: compare aid offers first.",
      rationale: "Early Decision is binding, and Northgate's aid is need-based.",
      decidedAt: at("2026-10-03T22:00:00.000Z"),
    },
    {
      ownerId,
      summary: "Keep the list at 6 schools: 2 likely, 2 target, 2 reach.",
      decidedAt: at("2026-09-29T22:00:00.000Z"),
    },
  ]);

  const robotics = one(
    await db
      .insert(stories)
      .values({
        ownerId,
        title: "Robotics → library STEM nights",
        moment:
          "Last spring the librarian asked our robotics team to run a STEM night. The first night 30 kids came, and we had four robots and one extension cord.",
        themes: ["service", "teaching", "leadership"],
        evidence: "Ran STEM nights every other Thursday from February to May.",
        summary: "Turned robotics skills into library STEM nights for elementary kids.",
        createdAt: oct1,
      })
      .returning(),
    "stories",
  );
  const bakery = one(
    await db
      .insert(stories)
      .values({
        ownerId,
        title: "Night shift at the bakery",
        moment:
          "I open Sunrise Bakery at 5 a.m. on weekends. The first month I ruined a whole batch and had to tell the owner.",
        themes: ["work", "responsibility"],
        summary: "Weekend early shifts taught me to plan ahead and own mistakes.",
        createdAt: oct1,
      })
      .returning(),
    "stories",
  );
  await db.insert(stories).values([
    {
      ownerId,
      title: "Translating at the clinic",
      moment: "At the Maple Community Clinic I translate between Spanish and English for families at the front desk.",
      themes: ["family", "language", "care"],
      createdAt: oct1,
    },
    {
      ownerId,
      title: "Losing the regional final",
      moment: "Our robot lost the regional final by two points after our arm jammed in the last ten seconds.",
      themes: ["setback", "teamwork"],
      createdAt: oct1,
    },
  ]);
  return { roboticsId: robotics.id, bakeryId: bakery.id };
}

async function seedEssays(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog, story: StoryIds): Promise<EssayIds> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  const hill = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "Hill Country STEM Award answers",
        prompt: "Describe a STEM project you led. How will you use STEM to help your community? (150 words each)",
        wordLimit: 150,
        targetType: "scholarship",
        targetScholarshipId: s.hillCountry,
        currentVersion: 1,
        createdAt: at("2026-10-03T17:00:00.000Z"),
      })
      .returning(),
    "essays",
  );
  const stateU = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "State U supplement",
        prompt: "Why State U? Tell us how you would use our engineering programs.",
        wordLimit: 250,
        targetType: "college",
        targetCollegeId: catalog.collegeIds.stateU,
        createdAt: at("2026-09-30T20:00:00.000Z"),
      })
      .returning(),
    "essays",
  );
  const rotary = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "Rotary Club of Eastside essay",
        prompt: "Describe a time you used your skills to serve your community.",
        wordLimit: 500,
        targetType: "scholarship",
        targetScholarshipId: s.rotary,
        currentVersion: 2,
        createdAt: at("2026-10-04T19:30:00.000Z"),
      })
      .returning(),
    "essays",
  );
  const library = one(
    await db
      .insert(essays)
      .values({
        ownerId,
        title: "Maple Library Essay Prize",
        prompt: "Write about a time work taught you something school couldn't.",
        wordLimit: 400,
        targetType: "scholarship",
        targetScholarshipId: s.mapleLibrary,
        currentVersion: 1,
        status: "submitted",
        createdAt: at("2026-08-08T18:00:00.000Z"),
      })
      .returning(),
    "essays",
  );

  await db.insert(essayVersions).values([
    {
      essayId: hill.id,
      version: 1,
      body: HILL_COUNTRY_DRAFT,
      wordCount: 58,
      authorId: ownerId,
      createdAt: at("2026-10-03T17:10:00.000Z"),
    },
    {
      essayId: rotary.id,
      version: 1,
      body: ROTARY_DRAFT_1,
      wordCount: 79,
      authorId: ownerId,
      createdAt: at("2026-10-04T20:00:00.000Z"),
    },
    {
      essayId: rotary.id,
      version: 2,
      body: ROTARY_DRAFT_2,
      wordCount: 142,
      authorId: ownerId,
      createdAt: at("2026-10-06T21:58:00.000Z"),
    },
    {
      essayId: library.id,
      version: 1,
      body: LIBRARY_ESSAY,
      wordCount: 57,
      authorId: ownerId,
      createdAt: at("2026-08-10T18:00:00.000Z"),
    },
  ]);

  const reviewedAt = at("2026-10-06T22:00:00.000Z");
  await db.insert(essayComments).values([
    {
      essayId: rotary.id,
      version: 2,
      author: "quill",
      kind: "structure",
      quote: "I have always been passionate about robotics.",
      body: "This tells the reader you're passionate. Can you open inside the room instead? What did the first STEM night look and sound like?",
      createdAt: reviewedAt,
    },
    {
      essayId: rotary.id,
      version: 2,
      author: "quill",
      kind: "question",
      quote: "30 kids came",
      body: "That's a headcount. What changed for one of those kids? One kid's moment will carry more than the number.",
      createdAt: reviewedAt,
    },
    {
      essayId: rotary.id,
      version: 2,
      author: "quill",
      kind: "prompt_fit",
      quote: "By May, some of the kids were building their own sensors and teaching their parents how they worked.",
      body: "This is your strongest line. Rotary asks how you served your community: who were these nights for, and what did those families need?",
      createdAt: reviewedAt,
    },
  ]);

  await db.insert(storyUses).values([
    {
      storyId: story.roboticsId,
      essayId: hill.id,
      scholarshipId: s.hillCountry,
      usedAt: at("2026-10-03T17:10:00.000Z"),
    },
    {
      storyId: story.roboticsId,
      essayId: stateU.id,
      collegeId: catalog.collegeIds.stateU,
      usedAt: at("2026-09-30T20:00:00.000Z"),
    },
    { storyId: story.roboticsId, essayId: rotary.id, scholarshipId: s.rotary, usedAt: at("2026-10-04T20:00:00.000Z") },
    {
      storyId: story.bakeryId,
      essayId: library.id,
      scholarshipId: s.mapleLibrary,
      usedAt: at("2026-08-10T18:00:00.000Z"),
    },
  ]);

  return { hillCountry: hill.id, stateU: stateU.id, rotary: rotary.id, library: library.id };
}

async function seedCollegeList(
  db: DbOrTx,
  people: SeedPeople,
  catalog: SeedCatalog,
  stateUEssayId: string,
): Promise<Record<CollegeKey, string>> {
  const ownerId = people.jordanId;
  const entryIds = {} as Record<CollegeKey, string>;
  for (const spec of COLLEGE_LIST) {
    const entry = one(
      await db
        .insert(collegeList)
        .values({
          ownerId,
          collegeId: catalog.collegeIds[spec.college],
          fit: spec.fit,
          plan: spec.plan,
          status: spec.status,
          season: "2026-27",
          createdAt: at("2026-09-29T19:00:00.000Z"),
        })
        .returning(),
      "college_list",
    );
    entryIds[spec.college] = entry.id;
    await db.insert(applicationItems).values(
      spec.items.map(
        ([kind, label, status]): NewItem => ({
          ownerId,
          collegeListId: entry.id,
          kind,
          label,
          status,
          dueOn: spec.dueOn,
          essayId: spec.college === "stateU" && kind === "supplement" ? stateUEssayId : null,
        }),
      ),
    );
  }
  return entryIds;
}

async function seedHelpers(db: DbOrTx, people: SeedPeople, entryIds: Record<CollegeKey, string>): Promise<string> {
  const ownerId = people.jordanId;
  const patel = one(
    await db
      .insert(recommenders)
      .values({ ownerId, name: "Ms. Patel", email: "patel@example.com", relationship: "Physics teacher" })
      .returning(),
    "recommenders",
  );
  const okafor = one(
    await db
      .insert(recommenders)
      .values({ ownerId, name: "Mr. Okafor", email: "okafor@example.com", relationship: "School counselor" })
      .returning(),
    "recommenders",
  );
  await db.insert(recRequests).values([
    {
      ownerId,
      recommenderId: okafor.id,
      collegeListId: entryIds.stateU,
      status: "confirmed",
      requestedAt: at("2026-09-28T15:00:00.000Z"),
    },
    { ownerId, recommenderId: patel.id, collegeListId: entryIds.stateU, status: "draft" },
  ]);
  await db.insert(helperLinks).values([
    {
      studentId: ownerId,
      label: "Ms. Patel",
      helperRole: "recommender",
      scope: ["activities", "stories"],
      tokenHash: sha256Hex(SEED_TOKENS.patelHelperLink),
      expiresAt: daysFromNow(30),
    },
    {
      studentId: ownerId,
      label: "Mr. Okafor",
      helperRole: "counselor",
      scope: ["deadlines", "colleges"],
      tokenHash: sha256Hex(SEED_TOKENS.okaforHelperLink),
      expiresAt: daysFromNow(30),
    },
  ]);
  return patel.id;
}

async function seedApplications(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog): Promise<void> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  const maple = { code: "county", text: "You live in Maple County", sensitive: false };
  await db.insert(scholarshipApplications).values([
    { ownerId, scholarshipId: s.loneStar, stage: "matched", fitScore: 82, estMinutes: 45, matchReasons: [maple] },
    {
      ownerId,
      scholarshipId: s.firstGen,
      stage: "matched",
      fitScore: 78,
      estMinutes: 120,
      matchReasons: [{ code: "first_gen", text: "Matches a private detail you chose to use", sensitive: true }],
    },
    {
      ownerId,
      scholarshipId: s.codingForGood,
      stage: "matched",
      fitScore: 74,
      estMinutes: 40,
      matchReasons: [{ code: "interest", text: "Robotics and programming", sensitive: false }],
    },
    {
      ownerId,
      scholarshipId: s.hillCountry,
      stage: "drafting",
      fitScore: 90,
      estMinutes: 30,
      matchReasons: [{ code: "interest", text: "Robotics and engineering", sensitive: false }],
    },
    { ownerId, scholarshipId: s.rotary, stage: "planned", fitScore: 88, estMinutes: 45, matchReasons: [maple] },
    {
      ownerId,
      scholarshipId: s.eastsidePta,
      stage: "submitted",
      fitScore: 70,
      estMinutes: 45,
      submittedAt: at("2026-09-28T23:00:00.000Z"),
    },
    {
      ownerId,
      scholarshipId: s.farmBureau,
      stage: "submitted",
      fitScore: 72,
      estMinutes: 60,
      matchReasons: [maple],
      submittedAt: at("2026-09-20T22:00:00.000Z"),
    },
    {
      ownerId,
      scholarshipId: s.mapleLibrary,
      stage: "won",
      fitScore: 85,
      estMinutes: 60,
      matchReasons: [maple],
      submittedAt: at("2026-08-10T18:30:00.000Z"),
      outcomeUsd: 1000,
      outcomeRenewable: false,
      outcomeAt: at("2026-09-05T15:00:00.000Z"),
      thankYouSent: true,
    },
    {
      ownerId,
      scholarshipId: s.bluebonnet,
      stage: "lost",
      fitScore: 60,
      estMinutes: 60,
      submittedAt: at("2026-08-28T18:00:00.000Z"),
      outcomeAt: at("2026-09-22T15:00:00.000Z"),
    },
    { ownerId, scholarshipId: s.pecanValley, stage: "skipped", fitScore: 20, estMinutes: 90 },
  ]);
}

async function seedActivity(db: DbOrTx, people: SeedPeople): Promise<void> {
  const ownerId = people.jordanId;
  await db.insert(testScores).values({
    ownerId,
    test: "ACT",
    takenOn: "2026-09-12",
    official: true,
    composite: 27,
    sections: { english: 27, math: 28, reading: 26, science: 27 },
    createdAt: at("2026-09-30T15:00:00.000Z"),
  });
  await db.insert(activities).values([
    {
      ownerId,
      position: 1,
      name: "Robotics team",
      role: "Build lead",
      organization: "Maple High School",
      description:
        "Lead a 12-person build team; run STEM nights for elementary students at the public library every other week.",
      hoursPerWeek: 8,
      weeksPerYear: 30,
      grades: [9, 10, 11],
      category: "STEM",
    },
    {
      ownerId,
      position: 2,
      name: "Sunrise Bakery",
      role: "Counter and prep",
      organization: "Sunrise Bakery",
      description: "Open the shop at 5 a.m. on weekends; prep dough, run the register, and train new hires.",
      hoursPerWeek: 12,
      weeksPerYear: 40,
      grades: [10, 11],
      category: "Work",
    },
    {
      ownerId,
      position: 3,
      name: "Clinic interpreter",
      role: "Volunteer",
      organization: "Maple Community Clinic",
      description: "Interpret Spanish and English for families at the front desk.",
      hoursPerWeek: 3,
      weeksPerYear: 20,
      grades: [11],
      category: "Community service",
    },
  ]);
  await db.insert(serviceLogs).values([
    {
      ownerId,
      organization: "Maple Public Library",
      activity: "STEM night for elementary students",
      servedOn: "2026-09-24",
      minutes: 120,
      supervisorName: "Ms. Rivera",
      supervisorEmail: "rivera@example.com",
      verification: "verified",
      verifiedAt: at("2026-09-26T18:00:00.000Z"),
      verifierNote: "Jordan ran the robot station all evening.",
      reflection: "One kid finally got her line follower working and ran to get her mom.",
    },
    {
      ownerId,
      organization: "Maple Public Library",
      activity: "STEM night for elementary students",
      servedOn: "2026-10-01",
      minutes: 120,
      supervisorName: "Ms. Rivera",
      supervisorEmail: "rivera@example.com",
      verification: "requested",
      verificationTokenHash: sha256Hex(SEED_TOKENS.riveraVerification),
      verificationExpiresAt: daysFromNow(14),
    },
  ]);
}

async function seedMoneyAndAid(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog): Promise<void> {
  const ownerId = people.jordanId;
  const keys = Object.keys(catalog.collegeCosts) as CollegeKey[];
  await db.insert(costEstimates).values(
    keys.map((key): typeof costEstimates.$inferInsert => {
      const cost = catalog.collegeCosts[key];
      return {
        ownerId,
        collegeId: catalog.collegeIds[key],
        source: "scorecard",
        costOfAttendanceUsd: cost.costOfAttendanceUsd,
        freeMoneyUsd: cost.costOfAttendanceUsd - cost.gapUsd,
        netPriceUsd: cost.gapUsd,
        inputs: { incomeRange: "48_75k", sample: true },
        computedAt: at("2026-10-04T14:00:00.000Z"),
      };
    }),
  );

  const fafsaDone: Record<string, Date> = {
    studentaid_account: at("2026-10-04T16:40:00.000Z"),
    invite_contributors: at("2026-10-04T17:05:00.000Z"),
  };
  const aidItems: NewAidItem[] = [
    ...FAFSA_STEPS.map((step): NewAidItem => {
      const doneAt = fafsaDone[step.key];
      return {
        ownerId,
        awardYear: "2027-28",
        program: "fafsa",
        collegeId: null,
        key: step.key,
        title: step.title,
        assignee: step.assignee,
        status: doneAt ? "done" : "todo",
        dueOn: step.key === "submit" ? "2026-12-01" : null,
        completedAt: doneAt ?? null,
      };
    }),
    ...CSS_STEPS.map(
      (step): NewAidItem => ({
        ownerId,
        awardYear: "2027-28",
        program: "css",
        collegeId: catalog.collegeIds.northgate,
        key: step.key,
        title: step.title,
        assignee: step.assignee,
        dueOn: step.key === "css_submit" ? "2027-01-05" : null,
      }),
    ),
  ];
  const items = await db.insert(aidChecklistItems).values(aidItems).returning();

  // Parent steps are linked tasks (R2I-6): the aid item owns the status, so the seed sets none here. Same
  // title, detail, and due date that plan 08's ensureChecklists writes, so it finds these and adds nothing.
  const contributorTasks = items
    .filter((item) => item.assignee === "parent")
    .map((item): typeof familyTasks.$inferInsert => ({
      familyId: people.familyId,
      assigneeId: people.danaId,
      studentId: ownerId,
      kind: item.program === "fafsa" ? "fafsa_contributor" : "css_contributor",
      title: item.title,
      detail: item.program === "fafsa" ? `FAFSA ${item.awardYear}` : `CSS Profile ${item.awardYear}`,
      dueOn: item.dueOn,
      aidItemId: item.id,
      createdAt: at("2026-10-04T17:05:00.000Z"),
    }));

  await db.insert(familyTasks).values([
    ...contributorTasks,
    {
      familyId: people.familyId,
      assigneeId: people.danaId,
      studentId: ownerId,
      kind: "share_income_range",
      title: "Share household income range for matching",
      detail: "A range only, no documents.",
      status: "done",
      createdAt: at("2026-10-02T02:00:00.000Z"),
      completedAt: at("2026-10-03T01:30:00.000Z"),
    },
    {
      familyId: people.familyId,
      assigneeId: people.danaId,
      studentId: ownerId,
      kind: "review_costs",
      title: "Look over State U costs before Nov 1",
      detail: "Ledger will walk you through the estimate.",
      dueOn: "2026-11-01",
      createdAt: at("2026-10-05T14:00:00.000Z"),
    },
  ]);
}

async function seedWeek(
  db: DbOrTx,
  people: SeedPeople,
  catalog: SeedCatalog,
  refs: { essayIds: EssayIds; patelId: string },
): Promise<void> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  await db.insert(sweepRuns).values({
    ownerId,
    ranAt: at("2026-10-04T14:00:00.000Z"),
    newMatches: 3,
    totalUsd: 7500,
    reuseCount: 2,
    hiddenScams: 1,
    hiddenScholarshipIds: [s.goldenFuture],
  });
  const weekStart = "2026-10-05";
  const plannedAt = at("2026-10-05T05:00:00.000Z");
  // The seeded week stands in for a crew-generated plan, so "Plan my week" replaces it in dev (R2C-4).
  await db.insert(planItems).values([
    {
      ownerId,
      weekStart,
      title: "Hill Country STEM Award: two short answers",
      kind: "scholarship",
      refType: "scholarship",
      refId: s.hillCountry,
      minutes: 30,
      valueUsd: 1000,
      dueOn: "2026-10-15",
      contributors: ["scout", "quill"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "State U supplement: first draft",
      kind: "essay",
      refType: "essay",
      refId: refs.essayIds.stateU,
      minutes: 60,
      dueOn: "2026-11-01",
      contributors: ["atlas", "quill"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "Ask Ms. Patel for a recommendation",
      kind: "recommendation",
      refType: "recommender",
      refId: refs.patelId,
      minutes: 10,
      contributors: ["atlas"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "Start the 2027-28 FAFSA with Dana",
      kind: "aid",
      refType: "aid",
      minutes: 35,
      dueOn: "2026-12-01",
      contributors: ["aid"],
      generated: true,
      createdAt: plannedAt,
    },
    {
      ownerId,
      weekStart,
      title: "Upload your transcript",
      kind: "custom",
      minutes: 5,
      status: "done",
      contributors: ["compass"],
      generated: true,
      createdAt: plannedAt,
      completedAt: at("2026-10-05T22:00:00.000Z"),
    },
  ]);
}

async function crewExchange(
  db: DbOrTx,
  i: {
    ownerId: string;
    conversationId: string;
    askedById: string;
    question: string;
    reply: CrewReply;
    askedAt: Date;
    progress: ProgressEvent[];
  },
): Promise<void> {
  const request = one(
    await db
      .insert(messages)
      .values({
        conversationId: i.conversationId,
        authorKind: "user",
        authorUserId: i.askedById,
        body: i.question,
        createdAt: i.askedAt,
      })
      .returning(),
    "messages",
  );
  const answeredAt = new Date(i.askedAt.getTime() + 40_000);
  const answer = one(
    await db
      .insert(messages)
      .values({
        conversationId: i.conversationId,
        authorKind: "crew",
        body: i.reply.text,
        reply: i.reply,
        createdAt: answeredAt,
      })
      .returning(),
    "messages",
  );
  await db.insert(crewJobs).values({
    usageMonth: "2026-10",
    ownerId: i.ownerId,
    kind: "crew_request",
    status: "ready",
    conversationId: i.conversationId,
    requestMessageId: request.id,
    resultMessageId: answer.id,
    progress: i.progress,
    createdAt: i.askedAt,
    updatedAt: answeredAt,
  });
}

async function seedCrew(
  db: DbOrTx,
  people: SeedPeople,
  catalog: SeedCatalog,
  refs: { essayIds: EssayIds; roboticsId: string },
): Promise<void> {
  const ownerId = people.jordanId;
  const s = catalog.scholarshipIds;
  const weekend = one(
    await db
      .insert(conversations)
      .values({ ownerId, room: "my_crew", title: "Weekend plan", createdAt: at("2026-10-03T15:58:00.000Z") })
      .returning(),
    "conversations",
  );
  const weekendReply: CrewReply = {
    text: "Start with the Hill Country STEM Award. It's due Thursday, and your robotics story already answers both questions. Then get a first draft of the State U supplement down, since Early Action closes Nov 1. Rotary can wait until next weekend.",
    contributors: ["compass", "atlas", "scout", "quill"],
    question: null,
    actionCards: [
      {
        kind: "add_plan_item",
        id: "hill-country-weekend",
        label: "Add Hill Country to my weekend",
        item: {
          title: "Hill Country STEM Award: two short answers",
          kind: "scholarship",
          refType: "scholarship",
          refId: s.hillCountry,
          minutes: 30,
          valueUsd: 1000,
          dueOn: "2026-10-15",
          contributors: ["scout", "quill"],
          weekStart: "2026-10-05",
        },
      },
      {
        kind: "open_link",
        id: "open-hill-country",
        label: "Open Hill Country answers",
        href: `/essays/${refs.essayIds.hillCountry}`,
      },
    ],
    receipt: [
      { kind: "fact", label: "Profile: GPA 3.72, Maple County", refId: null, sourceUrl: null, verifiedAt: null },
      {
        kind: "catalog",
        label: "Hill Country listing, verified Oct 2",
        refId: s.hillCountry,
        sourceUrl: "https://example.org/scholarships/hill-country-stem-award",
        verifiedAt: "2026-10-02T15:00:00.000Z",
      },
      {
        kind: "catalog",
        label: "State U requirements, verified Sep 30",
        refId: catalog.collegeIds.stateU,
        sourceUrl: "https://example.org/state-u/admissions",
        verifiedAt: "2026-09-30T15:00:00.000Z",
      },
      {
        kind: "record",
        label: 'Story Bank: "Robotics → library STEM nights"',
        refId: refs.roboticsId,
        sourceUrl: null,
        verifiedAt: null,
      },
    ],
    safety: null,
    needsInput: false,
  };
  await crewExchange(db, {
    ownerId,
    conversationId: weekend.id,
    askedById: ownerId,
    question: "I have 2 hours this weekend. What should I work on?",
    reply: weekendReply,
    askedAt: at("2026-10-03T16:00:00.000Z"),
    progress: [
      { at: "2026-10-03T16:00:02.000Z", role: "compass", text: "Asking Atlas, Scout, and Quill" },
      { at: "2026-10-03T16:00:20.000Z", role: "scout", text: "Checked deadlines for the next 4 weeks" },
      { at: "2026-10-03T16:00:35.000Z", role: "quill", text: "Matched your robotics story to both questions" },
    ],
  });

  const familyRoom = one(
    await db
      .insert(conversations)
      .values({
        ownerId,
        room: "family",
        familyId: people.familyId,
        title: "Family room",
        createdAt: at("2026-10-04T00:59:00.000Z"),
      })
      .returning(),
    "conversations",
  );
  const northgateReply: CrewReply = {
    text: "Northgate's estimated year-1 cost is $12,800, which is $8,200 more than the $4,600-a-year family budget you shared. Its aid is need-based, so the real number arrives with the offer in March.",
    contributors: ["compass", "ledger"],
    question: null,
    actionCards: [{ kind: "open_link", id: "compare-costs", label: "Compare all costs", href: "/money" }],
    receipt: [
      {
        kind: "calculation",
        label: "Year-1 gap at Northgate: $68,400 to attend minus $55,600 estimated free money",
        refId: catalog.collegeIds.northgate,
        sourceUrl: null,
        verifiedAt: null,
      },
      {
        kind: "record",
        label: "Family budget: $4,600 a year, shared by Dana",
        refId: null,
        sourceUrl: null,
        verifiedAt: null,
      },
    ],
    safety: null,
    needsInput: false,
  };
  await crewExchange(db, {
    ownerId,
    conversationId: familyRoom.id,
    askedById: people.danaId,
    question: "Is Northgate realistic for us?",
    reply: northgateReply,
    askedAt: at("2026-10-04T01:00:00.000Z"),
    progress: [
      { at: "2026-10-04T01:00:05.000Z", role: "ledger", text: "Compared Northgate's estimate with the shared budget" },
    ],
  });

  await db.insert(notifications).values([
    {
      userId: ownerId,
      kind: "new_matches",
      title: "3 new matches worth $7,500",
      body: "2 reuse your essays. 1 was hidden for charging a fee.",
      link: "/scholarships",
      dedupeKey: "seed:jordan:sweep:2026-10-04",
      createdAt: at("2026-10-04T14:01:00.000Z"),
    },
    {
      userId: ownerId,
      kind: "job_ready",
      title: "Your crew planned your weekend",
      body: "Start with the Hill Country STEM Award.",
      link: `/crew/${weekend.id}`,
      dedupeKey: "seed:jordan:job:weekend-plan",
      createdAt: at("2026-10-03T16:00:40.000Z"),
      readAt: at("2026-10-03T16:05:00.000Z"),
    },
    {
      userId: people.danaId,
      kind: "family",
      title: "Jordan added you as a FAFSA contributor",
      body: "Add your info from your own StudentAid.gov account.",
      link: "/family",
      dedupeKey: "seed:dana:fafsa-contributor",
      createdAt: at("2026-10-04T17:05:00.000Z"),
    },
  ]);
}

/** Jordan's records: memory, essays, colleges, helpers, applications, activity, money, this week, and crew chats. */
export async function seedRecords(db: DbOrTx, people: SeedPeople, catalog: SeedCatalog): Promise<void> {
  const storyIds = await seedMemory(db, people);
  const essayIds = await seedEssays(db, people, catalog, storyIds);
  const entryIds = await seedCollegeList(db, people, catalog, essayIds.stateU);
  const patelId = await seedHelpers(db, people, entryIds);
  await seedApplications(db, people, catalog);
  await seedActivity(db, people);
  await seedMoneyAndAid(db, people, catalog);
  await seedWeek(db, people, catalog, { essayIds, patelId });
  await seedCrew(db, people, catalog, { essayIds, roboticsId: storyIds.roboticsId });
}
