import type { ApiTokenScope } from "@scholarcrew/domain";
import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, emptyJsonObject, ts, uuidPk } from "./columns";
import { roleEnum, userStatusEnum } from "./enums";

export const users = pgTable("users", {
  id: uuidPk(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  role: roleEnum("role").notNull().default("student"),
  birthYear: integer("birth_year"),
  timeZone: text("time_zone").notNull().default("America/Chicago"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuidPk(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
  },
  (t) => [index("magic_links_email_idx").on(t.email)],
);

export const apiTokens = pgTable("api_tokens", {
  id: uuidPk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").array().$type<ApiTokenScope[]>().notNull(),
  label: text("label").notNull().default(""),
  createdAt: createdAt(),
  lastUsedAt: ts("last_used_at"),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuidPk(),
    actorId: uuid("actor_id"),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(emptyJsonObject()),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_actor_id_idx").on(t.actorId),
    index("audit_events_created_at_idx").on(t.createdAt),
  ],
);

export const devOutbox = pgTable(
  "dev_outbox",
  {
    id: uuidPk(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("dev_outbox_to_idx").on(t.to)],
);
