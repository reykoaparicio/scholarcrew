import { sql } from "drizzle-orm";

import type { CrewRole, MatchReason } from "@scholarcrew/domain";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { colleges, scholarships } from "./catalog";
import {
  bytea,
  createdAt,
  emptyIntArray,
  emptyJsonArray,
  emptyJsonObject,
  emptyTextArray,
  ts,
  updatedAt,
  uuidPk,
} from "./columns";
import {
  aidProgramEnum,
  appItemKindEnum,
  appPlanEnum,
  appStageEnum,
  appStatusEnum,
  assigneeKindEnum,
  commentAuthorEnum,
  commentKindEnum,
  costSourceEnum,
  documentKindEnum,
  essayStatusEnum,
  essayTargetEnum,
  fitEnum,
  itemStatusEnum,
  offerLineCategoryEnum,
  offerStatusEnum,
  parseStatusEnum,
  planItemKindEnum,
  recStatusEnum,
  taskStatusEnum,
  testKindEnum,
  verificationStatusEnum,
} from "./enums";
import { users } from "./identity";
import { stories } from "./memory";

const ownerRef = () =>
  uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const collegeList = pgTable(
  "college_list",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    collegeId: text("college_id")
      .notNull()
      .references(() => colleges.id),
    fit: fitEnum("fit").notNull(),
    plan: appPlanEnum("plan").notNull(),
    status: appStatusEnum("status").notNull().default("researching"),
    season: text("season").notNull(),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("college_list_owner_college_active_uq").on(t.ownerId, t.collegeId).where(sql`${t.archivedAt} is null`),
  ],
);

export const applicationItems = pgTable("application_items", {
  id: uuidPk(),
  ownerId: ownerRef(),
  collegeListId: uuid("college_list_id")
    .notNull()
    .references(() => collegeList.id, { onDelete: "cascade" }),
  kind: appItemKindEnum("kind").notNull(),
  label: text("label").notNull(),
  status: itemStatusEnum("status").notNull().default("todo"),
  dueOn: date("due_on", { mode: "string" }),
  essayId: uuid("essay_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recommenders = pgTable("recommenders", {
  id: uuidPk(),
  ownerId: ownerRef(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  relationship: text("relationship").notNull().default(""),
  createdAt: createdAt(),
});

export const recRequests = pgTable("rec_requests", {
  id: uuidPk(),
  ownerId: ownerRef(),
  recommenderId: uuid("recommender_id")
    .notNull()
    .references(() => recommenders.id, { onDelete: "cascade" }),
  collegeListId: uuid("college_list_id").references(() => collegeList.id, { onDelete: "set null" }),
  scholarshipApplicationId: uuid("scholarship_application_id").references(
    (): AnyPgColumn => scholarshipApplications.id,
    { onDelete: "set null" },
  ),
  helperLinkId: uuid("helper_link_id"),
  /** The student's note to the recommender, shown on the helper view (D38). */
  message: text("message").notNull().default(""),
  status: recStatusEnum("status").notNull().default("draft"),
  requestedAt: ts("requested_at"),
  updatedAt: updatedAt(),
});

export const scholarshipApplications = pgTable(
  "scholarship_applications",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    scholarshipId: uuid("scholarship_id")
      .notNull()
      .references(() => scholarships.id, { onDelete: "cascade" }),
    stage: appStageEnum("stage").notNull().default("matched"),
    matchReasons: jsonb("match_reasons").$type<MatchReason[]>().notNull().default(emptyJsonArray()),
    fitScore: integer("fit_score").notNull().default(0),
    estMinutes: integer("est_minutes").notNull().default(60),
    submittedAt: ts("submitted_at"),
    outcomeUsd: integer("outcome_usd"),
    outcomeRenewable: boolean("outcome_renewable"),
    outcomeAt: ts("outcome_at"),
    thankYouSent: boolean("thank_you_sent").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("scholarship_applications_owner_scholarship_uq").on(t.ownerId, t.scholarshipId)],
);

export const essays = pgTable("essays", {
  id: uuidPk(),
  ownerId: ownerRef(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  wordLimit: integer("word_limit"),
  charLimit: integer("char_limit"),
  targetType: essayTargetEnum("target_type").notNull().default("general"),
  targetCollegeId: text("target_college_id"),
  targetScholarshipId: uuid("target_scholarship_id"),
  currentVersion: integer("current_version").notNull().default(0),
  status: essayStatusEnum("status").notNull().default("drafting"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const essayVersions = pgTable(
  "essay_versions",
  {
    id: uuidPk(),
    essayId: uuid("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    wordCount: integer("word_count").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique("essay_versions_essay_version_uq").on(t.essayId, t.version)],
);

export const essayComments = pgTable("essay_comments", {
  id: uuidPk(),
  essayId: uuid("essay_id")
    .notNull()
    .references(() => essays.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  author: commentAuthorEnum("author").notNull(),
  kind: commentKindEnum("kind").notNull(),
  quote: text("quote").notNull(),
  occurrence: integer("occurrence").notNull().default(1),
  body: text("body").notNull(),
  jobId: uuid("job_id"),
  resolvedAt: ts("resolved_at"),
  createdAt: createdAt(),
});

/** Lives here, next to essays, so memory.ts never imports pipeline.ts. */
export const storyUses = pgTable(
  "story_uses",
  {
    id: uuidPk(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    essayId: uuid("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    collegeId: text("college_id"),
    scholarshipId: uuid("scholarship_id"),
    usedAt: ts("used_at").notNull().defaultNow(),
  },
  (t) => [unique("story_uses_story_essay_uq").on(t.storyId, t.essayId)],
);

export const testScores = pgTable("test_scores", {
  id: uuidPk(),
  ownerId: ownerRef(),
  test: testKindEnum("test").notNull(),
  takenOn: date("taken_on", { mode: "string" }).notNull(),
  official: boolean("official").notNull(),
  composite: integer("composite").notNull(),
  sections: jsonb("sections").$type<Record<string, number>>().notNull(),
  createdAt: createdAt(),
});

export const activities = pgTable(
  "activities",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    organization: text("organization").notNull().default(""),
    description: text("description").notNull().default(""),
    hoursPerWeek: integer("hours_per_week").notNull().default(0),
    weeksPerYear: integer("weeks_per_year").notNull().default(0),
    grades: integer("grades").array().notNull().default(emptyIntArray()),
    category: text("category").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("activities_owner_position_uq").on(t.ownerId, t.position)],
);

export const serviceLogs = pgTable("service_logs", {
  id: uuidPk(),
  ownerId: ownerRef(),
  organization: text("organization").notNull(),
  activity: text("activity").notNull(),
  servedOn: date("served_on", { mode: "string" }).notNull(),
  minutes: integer("minutes").notNull(),
  supervisorName: text("supervisor_name").notNull().default(""),
  supervisorEmail: text("supervisor_email").notNull().default(""),
  verification: verificationStatusEnum("verification").notNull().default("self_reported"),
  verificationTokenHash: text("verification_token_hash").unique(),
  verificationExpiresAt: ts("verification_expires_at"),
  verifiedAt: ts("verified_at"),
  verifierNote: text("verifier_note").notNull().default(""),
  reflection: text("reflection").notNull().default(""),
  createdAt: createdAt(),
});

export const costEstimates = pgTable(
  "cost_estimates",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    collegeId: text("college_id")
      .notNull()
      .references(() => colleges.id),
    source: costSourceEnum("source").notNull(),
    costOfAttendanceUsd: integer("cost_of_attendance_usd").notNull(),
    freeMoneyUsd: integer("free_money_usd").notNull(),
    netPriceUsd: integer("net_price_usd").notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default(emptyJsonObject()),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [unique("cost_estimates_owner_college_source_uq").on(t.ownerId, t.collegeId, t.source)],
);

export const blobs = pgTable("blobs", {
  id: uuidPk(),
  ciphertext: bytea("ciphertext").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  keyId: smallint("key_id").notNull().default(1),
  createdAt: createdAt(),
});

export const documents = pgTable("documents", {
  id: uuidPk(),
  ownerId: ownerRef(),
  kind: documentKindEnum("kind").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blobId: uuid("blob_id")
    .notNull()
    .references(() => blobs.id),
  parseStatus: parseStatusEnum("parse_status").notNull().default("none"),
  uploadedAt: ts("uploaded_at").notNull().defaultNow(),
});

export const offers = pgTable("offers", {
  id: uuidPk(),
  ownerId: ownerRef(),
  collegeId: text("college_id")
    .notNull()
    .references(() => colleges.id),
  awardYear: text("award_year").notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  status: offerStatusEnum("status").notNull().default("uploaded"),
  costOfAttendanceUsd: integer("cost_of_attendance_usd"),
  createdAt: createdAt(),
  confirmedAt: ts("confirmed_at"),
  archivedAt: ts("archived_at"),
});

export const offerLines = pgTable("offer_lines", {
  id: uuidPk(),
  offerId: uuid("offer_id")
    .notNull()
    .references(() => offers.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  amountUsd: integer("amount_usd").notNull(),
  category: offerLineCategoryEnum("category").notNull(),
  renewable: boolean("renewable").notNull().default(false),
  renewalCondition: text("renewal_condition").notNull().default(""),
  page: integer("page"),
  citedText: text("cited_text").notNull().default(""),
  userCorrected: boolean("user_corrected").notNull().default(false),
});

export const aidChecklistItems = pgTable(
  "aid_checklist_items",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    awardYear: text("award_year").notNull(),
    program: aidProgramEnum("program").notNull(),
    collegeId: text("college_id"),
    key: text("key").notNull(),
    title: text("title").notNull(),
    assignee: assigneeKindEnum("assignee").notNull(),
    status: taskStatusEnum("status").notNull().default("todo"),
    dueOn: date("due_on", { mode: "string" }),
    completedAt: ts("completed_at"),
  },
  (t) => [
    unique("aid_checklist_items_uq").on(t.ownerId, t.awardYear, t.program, t.key, t.collegeId).nullsNotDistinct(),
  ],
);

export const sweepRuns = pgTable(
  "sweep_runs",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    ranAt: ts("ran_at").notNull().defaultNow(),
    newMatches: integer("new_matches").notNull(),
    totalUsd: integer("total_usd").notNull(),
    reuseCount: integer("reuse_count").notNull(),
    hiddenScams: integer("hidden_scams").notNull(),
    hiddenScholarshipIds: text("hidden_scholarship_ids").array().notNull().default(emptyTextArray()),
  },
  (t) => [index("sweep_runs_owner_ran_at_idx").on(t.ownerId, t.ranAt)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuidPk(),
    ownerId: ownerRef(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    kind: planItemKindEnum("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    minutes: integer("minutes").notNull(),
    valueUsd: integer("value_usd"),
    dueOn: date("due_on", { mode: "string" }),
    status: taskStatusEnum("status").notNull().default("todo"),
    contributors: text("contributors").array().$type<CrewRole[]>().notNull().default(emptyTextArray()),
    priority: integer("priority").notNull().default(0),
    /** True only for rows `replaceGeneratedPlan` wrote; a regenerate deletes only these (R2C-4). */
    generated: boolean("generated").notNull().default(false),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("plan_items_owner_week_idx").on(t.ownerId, t.weekStart)],
);
