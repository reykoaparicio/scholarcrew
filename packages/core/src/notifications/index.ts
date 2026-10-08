import { type DbOrTx, and, desc, eq, isNull, notificationPrefs, notifications, users } from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type Notification,
  type NotificationKind,
  type NotificationPrefs,
  NotificationPrefsPatch,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { decrypt, encrypt } from "../crypto";
import {
  type CoreDeps,
  type SmsSender,
  isUuid,
  localTimeParts,
  requireUuid,
  safeTimeZone,
  toIso,
  toIsoOrNull,
} from "../shared";

const DEFAULT_PREFS: NotificationPrefs = {
  digestDay: 0,
  digestHour: 16,
  emailEnabled: true,
  smsEnabled: false,
  phoneSet: false,
  quietStartHour: 21,
  quietEndHour: 7,
};

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: toIso(row.createdAt),
    readAt: toIsoOrNull(row.readAt),
  };
}

async function loadPrefs(db: DbOrTx, userId: string): Promise<NotificationPrefs> {
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  if (!row) return { ...DEFAULT_PREFS };
  return {
    digestDay: row.digestDay,
    digestHour: row.digestHour,
    emailEnabled: row.emailEnabled,
    smsEnabled: row.smsEnabled,
    phoneSet: row.phoneCiphertext !== null,
    quietStartHour: row.quietStartHour,
    quietEndHour: row.quietEndHour,
  };
}

/** Seconds until the quiet window ends, or 0 when `now` is outside it. Windows may wrap midnight. */
export function secondsUntilQuietEnd(now: Date, timeZone: string, startHour: number, endHour: number): number {
  if (startHour === endHour) return 0;
  const { hour, minute, second } = localTimeParts(now, safeTimeZone(timeZone));
  const quiet = startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  if (!quiet) return 0;
  const zone = safeTimeZone(timeZone);
  const firstMinute = now.getTime() - (minute * 60 + second) * 1000 + 60_000;
  for (let instant = firstMinute; instant <= now.getTime() + 48 * 3_600_000; instant += 60_000) {
    const parts = localTimeParts(new Date(instant), zone);
    if (parts.hour === endHour && parts.minute === 0 && parts.second === 0)
      return Math.ceil((instant - now.getTime()) / 1000);
  }
  throw new Error("Quiet-hour end not found");
}

/**
 * System only. Returns null when dedupeKey already exists or the user isn't active.
 * Callers never put essay text or sensitive values in title or body.
 * `sms` (R2I-9) also queues a text when the user turned texts on and saved a phone number.
 */
export async function notify(
  deps: CoreDeps,
  system: Actor,
  i: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    link?: string;
    dedupeKey: string;
    email?: boolean;
    sms?: boolean;
  },
): Promise<Notification | null> {
  assertSystem(system);
  const [user] = await deps.db.select({ status: users.status }).from(users).where(eq(users.id, i.userId));
  if (!user || user.status !== "active") return null;
  const [row] = await deps.db
    .insert(notifications)
    .values({
      userId: i.userId,
      kind: i.kind,
      title: i.title.slice(0, 200),
      body: i.body.slice(0, 1000),
      link: i.link ?? "",
      dedupeKey: i.dedupeKey,
      createdAt: deps.clock.now(),
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();
  const existing = row
    ? null
    : (
        await deps.db
          .select()
          .from(notifications)
          .where(and(eq(notifications.dedupeKey, i.dedupeKey), eq(notifications.userId, i.userId)))
          .limit(1)
      )[0];
  const target = row ?? existing;
  if (!target) return null;
  // Replaying delivery queues recovers an enqueue failure; send timestamps prevent duplicate delivery.
  if (i.email || i.sms) {
    const prefs = await loadPrefs(deps.db, i.userId);
    if (i.email && prefs.emailEnabled && !target.emailedAt)
      await deps.jobs.enqueue("notify.email", { notificationId: target.id });
    if (i.sms && prefs.smsEnabled && prefs.phoneSet && !target.smsSentAt)
      await deps.jobs.enqueue("notify.sms", { notificationId: target.id });
  }
  return row ? toNotification(row) : null;
}

/** System only (R2I-16: the digest job removes its guard row after a failed send so the next run retries). */
export async function retractNotification(deps: CoreDeps, system: Actor, id: string): Promise<void> {
  assertSystem(system);
  if (!isUuid(id)) return;
  await deps.db.delete(notifications).where(eq(notifications.id, id));
}

export async function listNotifications(deps: CoreDeps, actor: Actor): Promise<Notification[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return rows.map(toNotification);
}

export async function markRead(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Notification not found");
  const [row] = await deps.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId)));
  if (!row) throw notFound("Notification not found");
  if (row.readAt === null) {
    await deps.db.update(notifications).set({ readAt: deps.clock.now() }).where(eq(notifications.id, id));
  }
}

export async function getPrefs(deps: CoreDeps, actor: Actor): Promise<NotificationPrefs> {
  assertUser(actor);
  return loadPrefs(deps.db, actor.userId);
}

export async function updatePrefs(deps: CoreDeps, actor: Actor, p: NotificationPrefsPatch): Promise<NotificationPrefs> {
  assertUser(actor);
  const parsed = NotificationPrefsPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check your notification settings", parsed.error.issues);
  const { phone, ...rest } = parsed.data;
  const current = await loadPrefs(deps.db, actor.userId);
  const phoneSet = phone === undefined ? current.phoneSet : phone !== null;
  if ((rest.smsEnabled ?? current.smsEnabled) && !phoneSet) {
    throw invalidInput("Add a phone number to turn on text reminders");
  }
  let phoneCols: Partial<
    Pick<typeof notificationPrefs.$inferInsert, "phoneCiphertext" | "phoneIv" | "phoneTag" | "phoneKeyId">
  > = {};
  if (phone === null) phoneCols = { phoneCiphertext: null, phoneIv: null, phoneTag: null };
  if (typeof phone === "string") {
    const sealed = encrypt(deps.config.keyring, Buffer.from(phone, "utf8"));
    phoneCols = {
      phoneCiphertext: sealed.ciphertext,
      phoneIv: sealed.iv,
      phoneTag: sealed.tag,
      phoneKeyId: sealed.keyId,
    };
  }
  const set = { ...rest, ...phoneCols, updatedAt: deps.clock.now() };
  await deps.db
    .insert(notificationPrefs)
    .values({ userId: actor.userId, ...set })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set });
  return loadPrefs(deps.db, actor.userId);
}

/** System only (notify.email job). Respects email prefs and quiet hours in the user's time zone. */
export async function deliverEmail(deps: CoreDeps, system: Actor, notificationId: string): Promise<void> {
  assertSystem(system);
  if (!isUuid(notificationId)) return;
  const [row] = await deps.db
    .select({ n: notifications, email: users.email, timeZone: users.timeZone, status: users.status })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.id, notificationId));
  if (!row || row.n.emailedAt !== null || row.status !== "active") return;
  const prefs = await loadPrefs(deps.db, row.n.userId);
  if (!prefs.emailEnabled) return;
  const now = deps.clock.now();
  const wait = secondsUntilQuietEnd(now, row.timeZone, prefs.quietStartHour, prefs.quietEndHour);
  if (wait > 0) {
    await deps.jobs.enqueue("notify.email", { notificationId }, { startAfterSeconds: wait });
    return;
  }
  const appUrl = deps.config.appUrl;
  const link = row.n.link.startsWith("/") ? `${appUrl}${row.n.link}` : row.n.link;
  const text = [row.n.body, ...(link ? ["", link] : []), "", `Change email settings: ${appUrl}/settings`].join("\n");
  const claimed = await deps.db
    .update(notifications)
    .set({ emailedAt: now })
    .where(and(eq(notifications.id, notificationId), isNull(notifications.emailedAt)))
    .returning();
  if (!claimed.length) return;
  try {
    await deps.email.send(
      { to: row.email, subject: row.n.title, text },
      { idempotencyKey: `notification-${notificationId}` },
    );
  } catch (error) {
    // A timeout may mean the provider accepted it. Keep that claim and avoid a duplicate.
    if (
      error instanceof AppError &&
      typeof error.details === "object" &&
      error.details !== null &&
      "status" in error.details &&
      Number(error.details.status) >= 400 &&
      Number(error.details.status) < 500
    ) {
      await deps.db.update(notifications).set({ emailedAt: null }).where(eq(notifications.id, notificationId));
    } else {
      console.error("email.maybe_sent", { notificationId });
      return;
    }
    throw error;
  }
}

const SMS_MAX = 300;
const SMS_PREFIX = "ScholarCrew:";
const SMS_OPT_OUT = "Reply STOP to opt out.";

/**
 * System only (notify.sms job, R2I-9, NO-05). Texts only the title and link, outside quiet hours, once.
 * The send is claimed through smsSentAt first; a failed send releases the claim and rethrows so the
 * job retries only after a definite 4xx rejection. Ambiguous sends keep the claim. The phone number is decrypted here and never logged.
 */
export async function deliverSms(deps: CoreDeps, system: Actor, notificationId: string, sms: SmsSender): Promise<void> {
  assertSystem(system);
  if (!isUuid(notificationId)) return;
  const [row] = await deps.db
    .select({ n: notifications, timeZone: users.timeZone, status: users.status })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.id, notificationId));
  if (!row || row.n.smsSentAt !== null || row.status !== "active") return;
  const [prefs] = await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, row.n.userId));
  if (!prefs?.smsEnabled || !prefs.phoneCiphertext || !prefs.phoneIv || !prefs.phoneTag) return;
  const now = deps.clock.now();
  const wait = secondsUntilQuietEnd(now, row.timeZone, prefs.quietStartHour, prefs.quietEndHour);
  if (wait > 0) {
    await deps.jobs.enqueue("notify.sms", { notificationId }, { startAfterSeconds: wait });
    return;
  }
  const to = decrypt(deps.config.keyring, {
    ciphertext: prefs.phoneCiphertext,
    iv: prefs.phoneIv,
    tag: prefs.phoneTag,
    keyId: prefs.phoneKeyId,
  }).toString("utf8");
  const link = row.n.link.startsWith("/") ? `${deps.config.appUrl}${row.n.link}` : row.n.link;
  // R3E-7: the prefix, link, and opt-out line are fixed; only the title is shortened to fit SMS_MAX.
  const tail = [link, SMS_OPT_OUT].filter(Boolean).join(" ");
  const room = SMS_MAX - SMS_PREFIX.length - tail.length - 2;
  const title = row.n.title.length > room ? `${row.n.title.slice(0, Math.max(0, room - 1))}…` : row.n.title;
  const text = `${SMS_PREFIX} ${title} ${tail}`;
  const claimed = await deps.db
    .update(notifications)
    .set({ smsSentAt: now })
    .where(and(eq(notifications.id, notificationId), isNull(notifications.smsSentAt)))
    .returning({ id: notifications.id });
  if (claimed.length === 0) return;
  try {
    await sms.send({ to, text });
  } catch (e) {
    const status = typeof e === "object" && e !== null && "status" in e ? Number(e.status) : null;
    if (status !== null && status >= 400 && status < 500) {
      await deps.db.update(notifications).set({ smsSentAt: null }).where(eq(notifications.id, notificationId));
      throw e;
    }
    console.error("sms.maybe_sent", { notificationId });
  }
}
