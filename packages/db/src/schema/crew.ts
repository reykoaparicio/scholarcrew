import type { CrewReply, ProgressEvent, SafetyFlag, ShareCategory } from "@scholarcrew/domain";
import { index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, emptyJsonArray, emptyJsonObject, ts, updatedAt, uuidPk } from "./columns";
import { jobKindEnum, jobStatusEnum, messageAuthorEnum, roomKindEnum } from "./enums";
import { families } from "./family";
import { users } from "./identity";

export const conversations = pgTable(
  "conversations",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    room: roomKindEnum("room").notNull(),
    roomRefId: text("room_ref_id"),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    createdAt: createdAt(),
    expiresAt: ts("expires_at"),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("conversations_owner_room_idx").on(t.ownerId, t.room)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuidPk(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorKind: messageAuthorEnum("author_kind").notNull(),
    authorUserId: uuid("author_user_id"),
    body: text("body").notNull(),
    reply: jsonb("reply").$type<CrewReply>(),
    sharedCategories: text("shared_categories").array().$type<ShareCategory[]>(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export const crewJobs = pgTable(
  "crew_jobs",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: jobKindEnum("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    conversationId: uuid("conversation_id"),
    requestMessageId: uuid("request_message_id"),
    resultMessageId: uuid("result_message_id"),
    refId: text("ref_id"),
    progress: jsonb("progress").$type<ProgressEvent[]>().notNull().default(emptyJsonArray()),
    error: text("error"),
    safety: text("safety").$type<SafetyFlag>(),
    costMicros: integer("cost_micros").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: ts("lease_expires_at"),
    usageMonth: text("usage_month").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("crew_jobs_owner_created_idx").on(t.ownerId, t.createdAt)],
);

export const agentRuns = pgTable("agent_runs", {
  id: uuidPk(),
  jobId: uuid("job_id").references(() => crewJobs.id, { onDelete: "set null" }),
  userId: uuid("user_id"),
  role: text("role").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheWriteTokens: integer("cache_write_tokens").notNull(),
  stopReason: text("stop_reason").notNull(),
  costMicros: integer("cost_micros").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: createdAt(),
});

export const actionReceipts = pgTable(
  "action_receipts",
  {
    id: uuidPk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    appliedAt: ts("applied_at").notNull().defaultNow(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default(emptyJsonObject()),
  },
  (t) => [unique("action_receipts_message_card_uq").on(t.messageId, t.cardId)],
);
