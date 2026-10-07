import type { LocalArea, ScholarshipRequirements } from "@scholarcrew/domain";
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { catalogReports, catalogTasks, colleges, scholarships } from "../schema";
import type { SeedPeople } from "./people";
import { at, one } from "./util";

type NewCollege = typeof colleges.$inferInsert;
type NewScholarship = typeof scholarships.$inferInsert;

export type CollegeKey = "stateU" | "riverside" | "bayTech" | "northgate" | "centralState" | "lakeshore";
export type ScholarshipKey =
  | "hillCountry"
  | "rotary"
  | "loneStar"
  | "firstGen"
  | "codingForGood"
  | "eastsidePta"
  | "farmBureau"
  | "mapleLibrary"
  | "bluebonnet"
  | "pecanValley"
  | "goldenFuture";

export interface SeedCatalog {
  collegeIds: Record<CollegeKey, string>;
  collegeCosts: Record<CollegeKey, { costOfAttendanceUsd: number; gapUsd: number }>;
  scholarshipIds: Record<ScholarshipKey, string>;
}

interface CollegeSeed {
  gapUsd: number;
  row: NewCollege;
}

/** The 48_75k band equals the mockup's yearly gap for Jordan's family; the overall figure is a bit higher. */
function college(gapUsd: number, row: Omit<NewCollege, "netPriceByIncome">): CollegeSeed {
  return {
    gapUsd,
    row: {
      ...row,
      netPriceByIncome: {
        overall: gapUsd + 1500,
        under_30k: null,
        "30_48k": null,
        "48_75k": gapUsd,
        "75_110k": null,
        over_110k: null,
      },
    },
  };
}

const COLLEGES: Record<CollegeKey, CollegeSeed> = {
  stateU: college(9200, {
    id: "990001",
    name: "State U",
    state: "TX",
    city: "Lone Oak",
    control: "public",
    admitRateX1000: 640,
    costOfAttendanceUsd: 27800,
    testPolicy: "optional",
    superscore: true,
    cssProfileRequired: false,
    outsidePolicy: "added_on_top",
    meritTiers: [
      { label: "State U Merit Award", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3 },
    ],
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [{ prompt: "Why State U? Tell us how you would use our engineering programs.", wordLimit: 250 }],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 60,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2026-12-01",
    sourceUrl: "https://example.org/state-u/admissions",
    verifiedAt: at("2026-09-30T15:00:00.000Z"),
  }),
  riverside: college(6800, {
    id: "990002",
    name: "Riverside College",
    state: "TX",
    city: "Riverside",
    control: "private_nonprofit",
    admitRateX1000: 780,
    costOfAttendanceUsd: 31200,
    testPolicy: "blind",
    superscore: null,
    cssProfileRequired: false,
    outsidePolicy: "added_on_top",
    meritTiers: [],
    deadlines: { ED: null, EA: null, REA: null, RD: null, rolling: true },
    requirements: {
      supplements: [],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 0,
      feeWaiverAvailable: false,
      portfolio: false,
      interview: "optional",
    },
    aidPriorityDate: "2027-02-15",
    sourceUrl: "https://example.org/riverside/admissions",
    verifiedAt: at("2026-09-20T15:00:00.000Z"),
  }),
  bayTech: college(11900, {
    id: "990003",
    name: "Bay Tech",
    state: "TX",
    city: "Port Bayou",
    control: "public",
    admitRateX1000: 520,
    costOfAttendanceUsd: 29500,
    testPolicy: "optional",
    superscore: true,
    cssProfileRequired: false,
    outsidePolicy: "may_reduce_grant",
    meritTiers: [
      { label: "Bay Tech Dean's Award", minGpa: 3.5, minAct: 29, minSat: 1350, annualUsd: 2000, renewalGpa: 3.25 },
    ],
    deadlines: { ED: null, EA: "2026-11-15", REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [{ prompt: "What problem would you like to solve at Bay Tech?", wordLimit: 300 }],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 50,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2027-01-15",
    sourceUrl: "https://example.org/bay-tech/admissions",
    verifiedAt: at("2026-09-28T15:00:00.000Z"),
  }),
  northgate: college(12800, {
    id: "990004",
    name: "Northgate University",
    state: "IL",
    city: "Northgate",
    control: "private_nonprofit",
    admitRateX1000: 180,
    costOfAttendanceUsd: 68400,
    testPolicy: "required",
    superscore: true,
    cssProfileRequired: true,
    outsidePolicy: "reduces_loans_first",
    meritTiers: [],
    deadlines: { ED: "2026-11-01", EA: null, REA: null, RD: "2027-01-05", rolling: false },
    requirements: {
      supplements: [{ prompt: "Why Northgate?", wordLimit: 250 }],
      teacherRecs: 2,
      counselorRec: true,
      applicationFeeUsd: 80,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "optional",
    },
    aidPriorityDate: "2027-02-01",
    sourceUrl: "https://example.org/northgate/admissions",
    verifiedAt: at("2026-09-25T15:00:00.000Z"),
  }),
  centralState: college(5900, {
    id: "990005",
    name: "Central State",
    state: "TX",
    city: "Midland Springs",
    control: "public",
    admitRateX1000: 850,
    costOfAttendanceUsd: 22400,
    testPolicy: "blind",
    superscore: null,
    cssProfileRequired: false,
    outsidePolicy: "added_on_top",
    meritTiers: [
      {
        label: "Central State Achievement Award",
        minGpa: 3.25,
        minAct: null,
        minSat: null,
        annualUsd: 1500,
        renewalGpa: 2.75,
      },
    ],
    deadlines: { ED: null, EA: null, REA: null, RD: null, rolling: true },
    requirements: {
      supplements: [],
      teacherRecs: 0,
      counselorRec: true,
      applicationFeeUsd: 40,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2027-01-15",
    sourceUrl: "https://example.org/central-state/admissions",
    verifiedAt: at("2026-09-22T15:00:00.000Z"),
  }),
  lakeshore: college(21300, {
    id: "990006",
    name: "Lakeshore University",
    state: "MI",
    city: "Lakeshore",
    control: "private_nonprofit",
    admitRateX1000: 210,
    costOfAttendanceUsd: 61500,
    testPolicy: "required",
    superscore: false,
    cssProfileRequired: false,
    outsidePolicy: "unknown",
    meritTiers: [],
    deadlines: { ED: null, EA: null, REA: null, RD: "2027-01-15", rolling: false },
    requirements: {
      supplements: [{ prompt: "Describe a community you belong to.", wordLimit: 300 }],
      teacherRecs: 1,
      counselorRec: true,
      applicationFeeUsd: 75,
      feeWaiverAvailable: true,
      portfolio: false,
      interview: "none",
    },
    aidPriorityDate: "2027-02-15",
    sourceUrl: "https://example.org/lakeshore/admissions",
    verifiedAt: at("2026-09-18T15:00:00.000Z"),
  }),
};

const NATIONAL: LocalArea = { national: true, state: null, counties: [], cities: [] };
const TEXAS: LocalArea = { national: false, state: "TX", counties: [], cities: [] };
const MAPLE: LocalArea = { national: false, state: "TX", counties: ["Maple"], cities: [] };
const EASTSIDE: LocalArea = { national: false, state: "TX", counties: ["Maple"], cities: ["Eastside"] };

function requirements(essays: ScholarshipRequirements["essays"], other: string[] = []): ScholarshipRequirements {
  return { essays, recommendations: 0, transcript: false, serviceHours: null, other };
}

function listing(slug: string, fields: Omit<NewScholarship, "slug" | "url" | "sourceUrl" | "cycle">): NewScholarship {
  const url = `https://example.org/scholarships/${slug}`;
  return { status: "published", ...fields, slug, url, sourceUrl: url, cycle: "2026-27" };
}

const LISTINGS: Record<ScholarshipKey, NewScholarship> = {
  hillCountry: listing("hill-country-stem-award", {
    name: "Hill Country STEM Award",
    provider: "Hill Country STEM Foundation",
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    deadline: "2026-10-15",
    localArea: TEXAS,
    eligibility: [
      { type: "state_in", states: ["TX"] },
      { type: "class_year_in", years: [2027] },
      { type: "interest_any", interests: ["robotics", "engineering", "programming"] },
    ],
    requirements: requirements([
      { prompt: "Describe a STEM project you led.", wordLimit: 150 },
      { prompt: "How will you use STEM to help your community?", wordLimit: 150 },
    ]),
    estMinutes: 60,
    verifiedAt: at("2026-10-02T15:00:00.000Z"),
  }),
  rotary: listing("rotary-club-of-eastside", {
    name: "Rotary Club of Eastside Scholarship",
    provider: "Rotary Club of Eastside",
    amountMinUsd: 2500,
    amountMaxUsd: 2500,
    deadline: "2026-10-30",
    localArea: EASTSIDE,
    eligibility: [
      { type: "county_in", state: "TX", counties: ["Maple"] },
      { type: "class_year_in", years: [2027] },
    ],
    requirements: requirements(
      [{ prompt: "Describe a time you used your skills to serve your community.", wordLimit: 500 }],
      ["Upload the essay as a PDF"],
    ),
    estMinutes: 45,
    verifiedAt: at("2026-10-02T15:00:00.000Z"),
  }),
  loneStar: listing("lone-star-credit-union-award", {
    name: "Lone Star Credit Union Award",
    provider: "Lone Star Credit Union",
    amountMinUsd: 1500,
    amountMaxUsd: 1500,
    deadline: "2026-11-20",
    localArea: MAPLE,
    eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    requirements: requirements([
      { prompt: "How has your community shaped your plans after high school?", wordLimit: 300 },
    ]),
    estMinutes: 45,
    verifiedAt: at("2026-10-02T15:00:00.000Z"),
  }),
  firstGen: listing("first-gen-futures-scholarship", {
    name: "First-Gen Futures Scholarship",
    provider: "First-Gen Futures Fund",
    amountMinUsd: 5000,
    amountMaxUsd: 5000,
    renewable: true,
    renewalTerms: "Renews each year with a 2.5 GPA and full-time enrollment.",
    deadline: "2026-12-01",
    localArea: NATIONAL,
    eligibility: [{ type: "first_gen" }, { type: "class_year_in", years: [2027] }],
    requirements: requirements([
      { prompt: "What does being the first in your family to go to college mean to you?", wordLimit: 400 },
      { prompt: "Describe a challenge you worked through and what you learned.", wordLimit: 400 },
    ]),
    estMinutes: 120,
    verifiedAt: at("2026-09-28T15:00:00.000Z"),
  }),
  codingForGood: listing("coding-for-good-award", {
    name: "Coding for Good Award",
    provider: "Coding for Good",
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    deadline: "2026-11-08",
    localArea: NATIONAL,
    eligibility: [{ type: "interest_any", interests: ["robotics", "programming", "coding"] }],
    requirements: requirements(
      [{ prompt: "Share a project link and tell us who it helps.", wordLimit: 200 }],
      ["Project link"],
    ),
    estMinutes: 40,
    verifiedAt: at("2026-10-01T15:00:00.000Z"),
  }),
  eastsidePta: listing("eastside-pta-senior-award", {
    name: "Eastside PTA Senior Award",
    provider: "Eastside PTA Council",
    amountMinUsd: 500,
    amountMaxUsd: 500,
    deadline: "2026-09-30",
    localArea: EASTSIDE,
    eligibility: [
      { type: "city_in", state: "TX", cities: ["Eastside"] },
      { type: "class_year_in", years: [2027] },
    ],
    requirements: requirements([{ prompt: "Tell us about a teacher who changed how you learn.", wordLimit: 250 }]),
    estMinutes: 45,
    verifiedAt: at("2026-09-15T15:00:00.000Z"),
  }),
  farmBureau: listing("maple-county-farm-bureau-award", {
    name: "Maple County Farm Bureau Award",
    provider: "Maple County Farm Bureau",
    amountMinUsd: 750,
    amountMaxUsd: 750,
    deadline: "2026-09-25",
    localArea: MAPLE,
    eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    requirements: requirements([{ prompt: "What does agriculture mean to Maple County's future?", wordLimit: 300 }]),
    estMinutes: 60,
    verifiedAt: at("2026-09-10T15:00:00.000Z"),
  }),
  mapleLibrary: listing("maple-library-essay-prize", {
    name: "Maple Library Essay Prize",
    provider: "Friends of the Maple Public Library",
    amountMinUsd: 1000,
    amountMaxUsd: 1000,
    deadline: "2026-08-15",
    localArea: MAPLE,
    eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
    requirements: requirements([
      { prompt: "Write about a time work taught you something school couldn't.", wordLimit: 400 },
    ]),
    estMinutes: 60,
    verifiedAt: at("2026-08-01T15:00:00.000Z"),
  }),
  bluebonnet: listing("bluebonnet-youth-leadership-award", {
    name: "Bluebonnet Youth Leadership Award",
    provider: "Bluebonnet Leadership Council",
    amountMinUsd: 750,
    amountMaxUsd: 750,
    deadline: "2026-09-01",
    localArea: TEXAS,
    eligibility: [{ type: "state_in", states: ["TX"] }],
    requirements: requirements([{ prompt: "Describe a time you led a group through a setback.", wordLimit: 300 }]),
    estMinutes: 60,
    verifiedAt: at("2026-08-15T15:00:00.000Z"),
  }),
  pecanValley: listing("pecan-valley-arts-scholarship", {
    name: "Pecan Valley Arts Scholarship",
    provider: "Pecan Valley Arts Council",
    amountMinUsd: 500,
    amountMaxUsd: 500,
    deadline: "2026-11-30",
    localArea: MAPLE,
    eligibility: [
      { type: "county_in", state: "TX", counties: ["Maple"] },
      { type: "interest_any", interests: ["visual art"] },
    ],
    requirements: requirements([], ["Portfolio of five pieces"]),
    estMinutes: 90,
    verifiedAt: at("2026-09-20T15:00:00.000Z"),
  }),
  goldenFuture: listing("golden-future-scholars-award", {
    name: "Golden Future Scholars Award",
    provider: "Golden Future Scholars",
    amountMinUsd: 10000,
    amountMaxUsd: 10000,
    deadline: "2026-12-31",
    localArea: NATIONAL,
    eligibility: [],
    requirements: requirements([], ['Pay a $25 "processing fee" to apply']),
    status: "flagged",
    scamFlags: ["application_fee"],
    estMinutes: 15,
    verifiedAt: null,
  }),
};

/** Upserts colleges by id and scholarships by slug, then replaces the seeded scam report and its admin task. */
export async function seedCatalog(db: DbOrTx, people: SeedPeople): Promise<SeedCatalog> {
  const collegeIds = {} as Record<CollegeKey, string>;
  const collegeCosts = {} as SeedCatalog["collegeCosts"];
  for (const [key, seed] of Object.entries(COLLEGES) as Array<[CollegeKey, CollegeSeed]>) {
    await db
      .insert(colleges)
      .values(seed.row)
      .onConflictDoUpdate({ target: colleges.id, set: { ...seed.row, updatedAt: new Date() } });
    collegeIds[key] = seed.row.id;
    collegeCosts[key] = { costOfAttendanceUsd: seed.row.costOfAttendanceUsd ?? 0, gapUsd: seed.gapUsd };
  }

  const scholarshipIds = {} as Record<ScholarshipKey, string>;
  for (const [key, entry] of Object.entries(LISTINGS) as Array<[ScholarshipKey, NewScholarship]>) {
    const values = { ...entry, verifiedById: entry.verifiedAt ? people.adminId : null };
    const row = one(
      await db
        .insert(scholarships)
        .values(values)
        .onConflictDoUpdate({ target: scholarships.slug, set: { ...values, updatedAt: new Date() } })
        .returning({ id: scholarships.id }),
      "scholarships",
    );
    scholarshipIds[key] = row.id;
  }

  const seededIds = Object.values(scholarshipIds);
  await db.delete(catalogTasks).where(inArray(catalogTasks.scholarshipId, seededIds));
  await db.delete(catalogReports).where(inArray(catalogReports.scholarshipId, seededIds));
  const report = one(
    await db
      .insert(catalogReports)
      .values({
        scholarshipId: scholarshipIds.goldenFuture,
        reporterId: people.jordanId,
        reason: "scam",
        details: 'Asks for a $25 "processing fee" before you can apply.',
        createdAt: at("2026-10-04T14:30:00.000Z"),
      })
      .returning(),
    "catalog_reports",
  );
  await db.insert(catalogTasks).values({
    kind: "report",
    scholarshipId: scholarshipIds.goldenFuture,
    payload: { type: "report", reportId: report.id, reason: "scam", details: report.details },
    createdById: people.jordanId,
    createdAt: at("2026-10-04T14:30:00.000Z"),
  });

  return { collegeIds, collegeCosts, scholarshipIds };
}
