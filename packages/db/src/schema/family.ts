import type { HelperScope } from "@scholarcrew/domain";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt, uuidPk } from "./columns";
import { familyMemberRoleEnum, familyTaskKindEnum, helperRoleEnum, shareCategoryEnum, taskStatusEnum } from "./enums";
import { users } from "./identity";
import { aidChecklistItems } from "./pipeline";

export const families = pgTable("families", {
  id: uuidPk(),
  name: text("name").notNull().default("Family"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const familyMembers = pgTable(
  "family_members",
  {
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberRole: familyMemberRoleEnum("member_role").notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.userId] }), uniqueIndex("family_members_user_uq").on(t.userId)],
);

export const familyInvites = pgTable("family_invites", {
  id: uuidPk(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  memberRole: familyMemberRoleEnum("member_role").notNull().default("parent"),
  invitedById: uuid("invited_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedById: uuid("accepted_by_id"),
});

export const shareSettings = pgTable(
  "share_settings",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    category: shareCategoryEnum("category").notNull(),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.familyId, t.category] })],
);

export const familyBudgets = pgTable("family_budgets", {
  familyId: uuid("family_id")
    .primaryKey()
    .references(() => families.id, { onDelete: "cascade" }),
  annualUsd: integer("annual_usd").notNull(),
  sharedById: uuid("shared_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  updatedAt: updatedAt(),
});

export const familyTasks = pgTable(
  "family_tasks",
  {
    id: uuidPk(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: familyTaskKindEnum("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("todo"),
    dueOn: date("due_on", { mode: "string" }),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
    /**
     * Set for FAFSA/CSS contributor tasks (R2I-6). The linked `aidChecklistItems` row owns status and
     * completedAt; core reads and writes those through the item, never this row.
     */
    aidItemId: uuid("aid_item_id").references(() => aidChecklistItems.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("family_tasks_family_status_idx").on(t.familyId, t.status),
    // Default nulls-distinct: any number of non-aid tasks per assignee, one task per (aid item, assignee).
    unique("family_tasks_aid_item_assignee_uq").on(t.aidItemId, t.assigneeId),
  ],
);

export const helperLinks = pgTable("helper_links", {
  id: uuidPk(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  helperRole: helperRoleEnum("helper_role").notNull(),
  scope: text("scope").array().$type<HelperScope[]>().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  lastUsedAt: ts("last_used_at"),
});
