import { boolean, index, integer, pgTable, primaryKey, smallint, text, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, ts, updatedAt, uuidPk } from "./columns";
import { exportStatusEnum, notificationKindEnum, planIdEnum, subscriptionStatusEnum } from "./enums";
import { users } from "./identity";

export const notifications = pgTable(
  "notifications",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull().default(""),
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: createdAt(),
    readAt: ts("read_at"),
    emailedAt: ts("emailed_at"),
    /** Claimed by `deliverSms` before sending, reset to null if the send fails (R2I-9). */
    smsSentAt: ts("sms_sent_at"),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  digestDay: integer("digest_day").notNull().default(0),
  digestHour: integer("digest_hour").notNull().default(16),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  phoneCiphertext: bytea("phone_ciphertext"),
  phoneIv: bytea("phone_iv"),
  phoneTag: bytea("phone_tag"),
  phoneKeyId: smallint("phone_key_id").notNull().default(1),
  quietStartHour: integer("quiet_start_hour").notNull().default(21),
  quietEndHour: integer("quiet_end_hour").notNull().default(7),
  updatedAt: updatedAt(),
});

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuidPk(),
  ownerId: uuid("owner_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: planIdEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeEventAt: ts("stripe_event_at"),
  currentPeriodEnd: ts("current_period_end"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    crewRequests: integer("crew_requests").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);

export const sponsorCodes = pgTable("sponsor_codes", {
  code: text("code").primaryKey(),
  sponsorName: text("sponsor_name").notNull(),
  plan: planIdEnum("plan").notNull(),
  seatsTotal: integer("seats_total").notNull(),
  seatsUsed: integer("seats_used").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
});

export const sponsorRedemptions = pgTable(
  "sponsor_redemptions",
  {
    code: text("code")
      .notNull()
      .references(() => sponsorCodes.code, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: ts("redeemed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.code, t.userId] })],
);

/** SQL table `exports`; the TypeScript name is `exportsTable` so no module binds `exports`. */
export const exportsTable = pgTable("exports", {
  id: uuidPk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: exportStatusEnum("status").notNull().default("queued"),
  blobId: uuid("blob_id"),
  createdAt: createdAt(),
  expiresAt: ts("expires_at"),
});
