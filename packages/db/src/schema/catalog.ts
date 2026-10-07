import { sql } from "drizzle-orm";

import type {
  CatalogTaskPayload,
  CollegeDeadlines,
  CollegeRequirements,
  EligibilityRule,
  LocalArea,
  MeritTier,
  NetPriceByIncome,
  ScamFlag,
  ScholarshipRequirements,
} from "@scholarcrew/domain";
import { boolean, date, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, emptyJsonArray, emptyTextArray, ts, updatedAt, uuidPk } from "./columns";
import {
  catalogStatusEnum,
  catalogTaskKindEnum,
  catalogTaskStatusEnum,
  collegeControlEnum,
  listingVisibilityEnum,
  outsidePolicyEnum,
  reportReasonEnum,
  reportStatusEnum,
  testPolicyEnum,
} from "./enums";
import { users } from "./identity";

export const scholarships = pgTable(
  "scholarships",
  {
    id: uuidPk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    url: text("url").notNull(),
    sourceUrl: text("source_url").notNull(),
    amountMinUsd: integer("amount_min_usd").notNull(),
    amountMaxUsd: integer("amount_max_usd").notNull(),
    renewable: boolean("renewable").notNull().default(false),
    renewalTerms: text("renewal_terms").notNull().default(""),
    deadline: date("deadline", { mode: "string" }),
    cycle: text("cycle").notNull(),
    localArea: jsonb("local_area").$type<LocalArea>().notNull(),
    eligibility: jsonb("eligibility").$type<EligibilityRule[]>().notNull().default(emptyJsonArray()),
    requirements: jsonb("requirements").$type<ScholarshipRequirements>().notNull(),
    status: catalogStatusEnum("status").notNull().default("draft"),
    visibility: listingVisibilityEnum("visibility").notNull().default("public"),
    submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    scamFlags: text("scam_flags").array().$type<ScamFlag[]>().notNull().default(emptyTextArray()),
    estMinutes: integer("est_minutes").notNull().default(60),
    verifiedAt: ts("verified_at"),
    verifiedById: uuid("verified_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("scholarships_status_idx").on(t.status),
    index("scholarships_deadline_idx").on(t.deadline),
    index("scholarships_visibility_idx").on(t.visibility),
  ],
);

export const scholarshipSources = pgTable("scholarship_sources", {
  id: uuidPk(),
  scholarshipId: uuid("scholarship_id")
    .notNull()
    .references(() => scholarships.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  fetchedAt: ts("fetched_at").notNull(),
  contentHash: text("content_hash").notNull(),
  excerpt: text("excerpt").notNull().default(""),
});

export const colleges = pgTable(
  "colleges",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    city: text("city").notNull(),
    control: collegeControlEnum("control").notNull(),
    admitRateX1000: integer("admit_rate_x1000"),
    costOfAttendanceUsd: integer("cost_of_attendance_usd"),
    netPriceByIncome: jsonb("net_price_by_income").$type<NetPriceByIncome>().notNull(),
    testPolicy: testPolicyEnum("test_policy").notNull().default("unknown"),
    superscore: boolean("superscore"),
    cssProfileRequired: boolean("css_profile_required").notNull().default(false),
    outsidePolicy: outsidePolicyEnum("outside_policy").notNull().default("unknown"),
    meritTiers: jsonb("merit_tiers").$type<MeritTier[]>().notNull().default(emptyJsonArray()),
    deadlines: jsonb("deadlines").$type<CollegeDeadlines>().notNull(),
    requirements: jsonb("requirements").$type<CollegeRequirements>().notNull(),
    aidPriorityDate: date("aid_priority_date", { mode: "string" }),
    sourceUrl: text("source_url").notNull().default(""),
    verifiedAt: ts("verified_at"),
    updatedAt: updatedAt(),
  },
  (t) => [index("colleges_state_idx").on(t.state), index("colleges_name_idx").on(t.name)],
);

export const aidRules = pgTable(
  "aid_rules",
  {
    id: uuidPk(),
    awardYear: text("award_year").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    sourceUrl: text("source_url").notNull(),
    verifiedAt: ts("verified_at").notNull(),
  },
  (t) => [unique("aid_rules_award_year_key_uq").on(t.awardYear, t.key)],
);

export const aidDeadlines = pgTable("aid_deadlines", {
  id: uuidPk(),
  awardYear: text("award_year").notNull(),
  state: text("state"),
  program: text("program").notNull(),
  deadline: date("deadline", { mode: "string" }),
  note: text("note").notNull().default(""),
  sourceUrl: text("source_url").notNull(),
  verifiedAt: ts("verified_at").notNull(),
});

export const catalogTasks = pgTable(
  "catalog_tasks",
  {
    id: uuidPk(),
    kind: catalogTaskKindEnum("kind").notNull(),
    status: catalogTaskStatusEnum("status").notNull().default("open"),
    scholarshipId: uuid("scholarship_id").references(() => scholarships.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<CatalogTaskPayload>().notNull(),
    createdById: uuid("created_by_id"),
    resolvedById: uuid("resolved_by_id"),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    index("catalog_tasks_status_kind_idx").on(t.status, t.kind),
    uniqueIndex("catalog_tasks_open_recheck_uq")
      .on(t.scholarshipId)
      .where(sql`${t.kind} = 'recheck_changed' and ${t.status} in ('open', 'in_review')`),
  ],
);

export const catalogReports = pgTable("catalog_reports", {
  id: uuidPk(),
  scholarshipId: uuid("scholarship_id")
    .notNull()
    .references(() => scholarships.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  reason: reportReasonEnum("reason").notNull(),
  details: text("details").notNull().default(""),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

export const recheckBatches = pgTable("recheck_batches", {
  id: uuidPk(),
  anthropicBatchId: text("anthropic_batch_id").notNull().unique(),
  scholarshipIds: text("scholarship_ids").array().notNull(),
  status: text("status")
    .$type<"in_progress" | "collecting" | "collected" | "failed">()
    .notNull()
    .default("in_progress"),
  createdAt: createdAt(),
  collectedAt: ts("collected_at"),
});
