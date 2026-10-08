import { devOutbox, eq, isNotNull, notificationPrefs, notifications, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf, latestEmail } from "../../test/helpers";
import { type SmsSender, createTestDeps, fixedClock } from "../shared";
import {
  deliverEmail,
  deliverSms,
  getPrefs,
  listNotifications,
  markRead,
  notify,
  retractNotification,
  secondsUntilQuietEnd,
  updatePrefs,
} from "./index";

const note = (userId: string, o: { dedupeKey?: string; email?: boolean } = {}) => ({
  userId,
  kind: "deadline" as const,
  title: "Maple Community Award is due in 3 days",
  body: "Your draft is ready for one more read.",
  link: "/scholarships/maple-community-award",
  dedupeKey: `deadline:${userId}:maple:3`,
  ...o,
});

describe("notify", () => {
  it("inserts once per dedupe key", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const first = await notify(deps, SYSTEM, note(user.id));
    expect(first).toMatchObject({ kind: "deadline", readAt: null, createdAt: "2026-10-06T15:00:00.000Z" });
    expect(await notify(deps, SYSTEM, note(user.id))).toBeNull();
    expect(await deps.db.select().from(notifications)).toHaveLength(1);
  });

  it("enqueues email only when asked and allowed", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id, { email: true }));
    expect(deps.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: n?.id } }]);
    await deps.db.insert(notificationPrefs).values({ userId: user.id, emailEnabled: false });
    await notify(deps, SYSTEM, note(user.id, { email: true, dedupeKey: "other" }));
    expect(deps.jobs.sent).toHaveLength(1);
  });

  it("is system-only and skips inactive users", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(notify(deps, actorOf(user), note(user.id))).rejects.toMatchObject({ code: "forbidden" });
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await notify(deps, SYSTEM, note(user.id))).toBeNull();
  });

  it("lists and marks read for the owner only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    expect(await listNotifications(deps, actorOf(other))).toEqual([]);
    await expect(markRead(deps, actorOf(other), n.id)).rejects.toMatchObject({ code: "not_found" });
    await markRead(deps, actorOf(user), n.id);
    expect((await listNotifications(deps, actorOf(user)))[0]?.readAt).toBe("2026-10-06T15:00:00.000Z");
  });
});

describe("preferences", () => {
  it("reads defaults, updates fields, and encrypts the phone number", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    expect(await getPrefs(deps, actorOf(user))).toEqual({
      digestDay: 0,
      digestHour: 16,
      emailEnabled: true,
      smsEnabled: false,
      phoneSet: false,
      quietStartHour: 21,
      quietEndHour: 7,
    });
    const next = await updatePrefs(deps, actorOf(user), { digestDay: 3, phone: "+15125550100", smsEnabled: true });
    expect(next).toMatchObject({ digestDay: 3, smsEnabled: true, phoneSet: true });
    const [row] = await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, user.id));
    expect(row?.phoneCiphertext?.includes(Buffer.from("5125550100"))).toBe(false);
    await expect(updatePrefs(deps, actorOf(user), { phone: null })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await updatePrefs(deps, actorOf(user), { smsEnabled: false, phone: null })).toMatchObject({
      phoneSet: false,
    });
  });

  it("refuses SMS without a phone number", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(updatePrefs(deps, actorOf(user), { smsEnabled: true })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});

describe("deliverEmail", () => {
  it("sends only the title, body, and link outside quiet hours, once", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id, { email: true }));
    if (!n) throw new Error("expected a notification");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await latestEmail(deps.db, user.email)).toEqual({
      subject: "Maple Community Award is due in 3 days",
      text: [
        "Your draft is ready for one more read.",
        "",
        "http://localhost:3000/scholarships/maple-community-award",
        "",
        "Change email settings: http://localhost:3000/settings",
      ].join("\n"),
    });
    const [row] = await deps.db.select().from(notifications);
    expect(row?.emailedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(devOutbox).where(eq(devOutbox.to, user.email))).toHaveLength(1);
  });

  it("waits until quiet hours end in the user's time zone", async () => {
    const clock = fixedClock("2026-10-07T03:30:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(devOutbox)).toHaveLength(0);
    expect(deps.jobs.sent).toEqual([
      { name: "notify.email", payload: { notificationId: n.id }, opts: { startAfterSeconds: 30600 } },
    ]);
  });

  it("doesn't send when email is off", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(notificationPrefs).values({ userId: user.id, emailEnabled: false });
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(devOutbox)).toHaveLength(0);
  });

  it("computes the wait for same-day and overnight quiet windows", () => {
    const tenAmChicago = new Date("2026-10-06T15:00:00.000Z");
    expect(secondsUntilQuietEnd(tenAmChicago, "America/Chicago", 9, 11)).toBe(3600);
    expect(secondsUntilQuietEnd(tenAmChicago, "America/Chicago", 21, 7)).toBe(0);
    expect(secondsUntilQuietEnd(tenAmChicago, "America/Chicago", 8, 8)).toBe(0);
  });
});

function fakeSms(fail = false): SmsSender & { sent: Array<{ to: string; text: string }> } {
  const sent: Array<{ to: string; text: string }> = [];
  return {
    sent,
    async send(m) {
      if (fail) throw Object.assign(new Error("twilio 400 0"), { status: 400 });
      sent.push(m);
    },
  };
}

async function textingStudent(deps: ReturnType<typeof createTestDeps>) {
  const { user } = await factories.student(deps.db);
  await updatePrefs(deps, actorOf(user), { phone: "+15125550100", smsEnabled: true });
  return user;
}

describe("SMS (R2I-9)", () => {
  it("notify enqueues a text only for an opted-in user", async () => {
    const deps = createTestDeps();
    const { user: quiet } = await factories.student(deps.db);
    await notify(deps, SYSTEM, { ...note(quiet.id), sms: true });
    expect(deps.jobs.sent).toEqual([]);
    const texter = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, { ...note(texter.id), sms: true });
    await notify(deps, SYSTEM, { ...note(texter.id), dedupeKey: "no-sms" });
    expect(deps.jobs.sent).toEqual([{ name: "notify.sms", payload: { notificationId: n?.id } }]);
  });

  it("deliverSms sends the title and link once, and nothing else", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, { ...note(user.id), sms: true });
    if (!n) throw new Error("expected a notification");
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, sms);
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sms.sent).toEqual([
      {
        to: "+15125550100",
        text: "ScholarCrew: Maple Community Award is due in 3 days http://localhost:3000/scholarships/maple-community-award Reply STOP to opt out.",
      },
    ]);
    expect(sms.sent[0]?.text).not.toContain("draft");
    const [row] = await deps.db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row?.smsSentAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    await expect(deliverSms(deps, actorOf(user), n.id, sms)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("shortens only the title, so the link and the opt-out line always fit (R3E-7)", async () => {
    const deps = createTestDeps();
    deps.config.appUrl = `https://${"a".repeat(32)}.test`; // 45 characters
    const user = await textingStudent(deps);
    const link = `/scholarships/${"s".repeat(80)}`;
    const n = await notify(deps, SYSTEM, {
      ...note(user.id),
      title: `${"N".repeat(184)} is due tomorrow`,
      link,
      sms: true,
    });
    if (!n) throw new Error("expected a notification");
    expect(n.title).toHaveLength(200);
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, sms);
    const text = sms.sent[0]?.text ?? "";
    expect(text.startsWith("ScholarCrew: NNN")).toBe(true);
    expect(text.endsWith(`${deps.config.appUrl}${link} Reply STOP to opt out.`)).toBe(true);
    expect(text).toContain("…");
    expect(text.length).toBeLessThanOrEqual(300);
  });

  it("skips missing rows, opted-out or phoneless users, and inactive accounts", async () => {
    const deps = createTestDeps();
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f", sms);
    const optedOut = await textingStudent(deps);
    await updatePrefs(deps, actorOf(optedOut), { smsEnabled: false });
    const { user: phoneless } = await factories.student(deps.db);
    await deps.db.insert(notificationPrefs).values({ userId: phoneless.id, smsEnabled: true });
    const gone = await textingStudent(deps);
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, gone.id));
    for (const u of [optedOut, phoneless]) {
      const n = await notify(deps, SYSTEM, { ...note(u.id), dedupeKey: `skip:${u.id}` });
      if (n) await deliverSms(deps, SYSTEM, n.id, sms);
    }
    const [goneRow] = await deps.db
      .insert(notifications)
      .values({ userId: gone.id, kind: "deadline", title: "t", body: "", dedupeKey: "gone" })
      .returning();
    await deliverSms(deps, SYSTEM, goneRow?.id ?? "", sms);
    expect(sms.sent).toEqual([]);
    expect(await deps.db.select().from(notifications).where(isNotNull(notifications.smsSentAt))).toEqual([]);
  });

  it("waits until quiet hours end", async () => {
    const clock = fixedClock("2026-10-07T03:30:00.000Z");
    const deps = createTestDeps({ clock });
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sms.sent).toEqual([]);
    expect(deps.jobs.sent).toEqual([
      { name: "notify.sms", payload: { notificationId: n.id }, opts: { startAfterSeconds: 30600 } },
    ]);
  });

  it("leaves delivery unclaimed when phone decryption fails, allowing recovery", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    const keyring = deps.config.keyring;
    const key = keyring.byId.get(keyring.primary.id);
    if (!key) throw new Error("expected encryption key");
    keyring.byId.delete(keyring.primary.id);
    const sms = fakeSms();
    await expect(deliverSms(deps, SYSTEM, n.id, sms)).rejects.toMatchObject({ code: "internal" });
    expect(sms.sent).toEqual([]);
    const [row] = await deps.db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row?.smsSentAt).toBeNull();
    keyring.byId.set(keyring.primary.id, key);
    await deliverSms(deps, SYSTEM, n.id, sms);
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sms.sent).toHaveLength(1);
  });

  it("releases the claim when the sender fails, so the job retries", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await expect(deliverSms(deps, SYSTEM, n.id, fakeSms(true))).rejects.toThrow("twilio 400 0");
    const [row] = await deps.db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row?.smsSentAt).toBeNull();
    const retry = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, retry);
    expect(retry.sent).toHaveLength(1);
  });
});

describe("retractNotification (R2I-16)", () => {
  it("is system-only and deletes the row so the dedupe key is free again", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await expect(retractNotification(deps, actorOf(user), n.id)).rejects.toMatchObject({ code: "forbidden" });
    await retractNotification(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(notifications)).toEqual([]);
    expect(await notify(deps, SYSTEM, note(user.id))).not.toBeNull();
  });
});

describe("DST quiet end", () => {
  it("targets 07:00 local on both transition nights", () => {
    const spring = new Date("2027-03-14T07:30:00Z");
    const fall = new Date("2027-11-07T06:30:00Z");
    expect(
      new Date(spring.getTime() + secondsUntilQuietEnd(spring, "America/Chicago", 21, 7) * 1000).toISOString(),
    ).toBe("2027-03-14T12:00:00.000Z");
    expect(new Date(fall.getTime() + secondsUntilQuietEnd(fall, "America/Chicago", 21, 7) * 1000).toISOString()).toBe(
      "2027-11-07T13:00:00.000Z",
    );
  });
});

describe("ambiguous notification sends", () => {
  it("keeps an email claim after a timeout so a retry sends once", async () => {
    let sends = 0;
    const deps = createTestDeps({
      email: {
        async send() {
          sends += 1;
          throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
        },
      },
    });
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected notice");
    await deliverEmail(deps, SYSTEM, n.id);
    await deliverEmail(deps, SYSTEM, n.id);
    expect(sends).toBe(1);
  });
  it("keeps the SMS claim after an abort", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected notice");
    let sends = 0;
    const sms: SmsSender = {
      async send() {
        sends += 1;
        throw Object.assign(new Error("abort"), { name: "AbortError" });
      },
    };
    await deliverSms(deps, SYSTEM, n.id, sms);
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sends).toBe(1);
  });
});
