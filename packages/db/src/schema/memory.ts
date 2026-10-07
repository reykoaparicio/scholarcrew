import { sql } from "drizzle-orm";

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, createdAt, emptyTextArray, ts, updatedAt, uuidPk } from "./columns";
import { factSourceEnum, factStatusEnum, factVisibilityEnum, sensitiveKindEnum } from "./enums";
import { users } from "./identity";

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  classYear: integer("class_year"),
  highSchool: text("high_school").notNull().default(""),
  state: text("state").notNull().default(""),
  county: text("county").notNull().default(""),
  city: text("city").notNull().default(""),
  gpaUnweightedX100: integer("gpa_unweighted_x100"),
  gpaWeightedX100: integer("gpa_weighted_x100"),
  intendedMajors: text("intended_majors").array().notNull().default(emptyTextArray()),
  interests: text("interests").array().notNull().default(emptyTextArray()),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  updatedAt: updatedAt(),
});

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    source: factSourceEnum("source").notNull(),
    sourceRef: text("source_ref"),
    visibility: factVisibilityEnum("visibility").notNull().default("crew"),
    status: factStatusEnum("status").notNull().default("confirmed"),
    supersededById: uuid("superseded_by_id"),
    createdAt: createdAt(),
    confirmedAt: ts("confirmed_at"),
    expiresAt: ts("expires_at"),
  },
  (t) => [
    index("memory_facts_owner_status_idx").on(t.ownerId, t.status),
    uniqueIndex("memory_facts_current_uq")
      .on(t.ownerId, t.key)
      .where(sql`${t.status} = 'confirmed' and ${t.supersededById} is null`),
  ],
);

export const sensitiveFacts = pgTable(
  "sensitive_facts",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: sensitiveKindEnum("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    ciphertext: bytea("ciphertext"),
    iv: bytea("iv"),
    tag: bytea("tag"),
    keyId: smallint("key_id").notNull().default(1),
    sharedByUserId: uuid("shared_by_user_id"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.kind] })],
);

export const decisions = pgTable("decisions", {
  id: uuidPk(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  rationale: text("rationale").notNull().default(""),
  sourceMessageId: uuid("source_message_id"),
  decidedAt: ts("decided_at").notNull().defaultNow(),
});

export const stories = pgTable(
  "stories",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    moment: text("moment").notNull(),
    themes: text("themes").array().notNull().default(emptyTextArray()),
    evidence: text("evidence").notNull().default(""),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("stories_owner_id_idx").on(t.ownerId)],
);
