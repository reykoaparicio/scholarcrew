import { addCollege } from "@scholarcrew/core/colleges";
import { notify, updatePrefs } from "@scholarcrew/core/notifications";
import { addPlanItem } from "@scholarcrew/core/plan";
import { saveScholarship } from "@scholarcrew/core/scholarships";
import { TEST_NOW } from "@scholarcrew/core/shared";
import { collegeList, eq, notificationPrefs, notifications, scholarshipApplications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { PlanItemInput } from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, emailsTo, makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleDigestWeekly } from "./digest-weekly";
import { handleNotifyEmail } from "./notify-email";
import { handleNotifySms } from "./notify-sms";
import { handleRemindersDeadlines, renewalBody } from "./reminders-deadlines";

const PHONE = "+15125550100";

const item = (title: string): PlanItemInput => ({
  title,
  kind: "essay",
  refType: null,
  refId: null,
  minutes: 45,
  valueUsd: null,
  dueOn: null,
  contributors: [],
  weekStart: null,
});

describe("reminders.deadlines", () => {
  it("creates each reminder once and queues its email (NO-03)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const listing = await factories.scholarship(core.db, { name: "Maple County STEM Award", deadline: "2026-10-13" });
    await saveScholarship(core, s.actor, { scholarshipId: listing.id });
    const [app] = await core.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, s.user.id));

    await handleRemindersDeadlines(deps, {});
    core.jobs.sent.length = 0;
    await handleRemindersDeadlines(deps, {});
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "deadline",
      title: "Maple County STEM Award is due in 7 days",
      body: "Due Oct 13. Plan time for it this week.",
      link: "/scholarships",
      dedupeKey: `reminder:scholarship_application:${app?.id}:2026-10-13:7`,
    });
    expect(core.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: notes[0]?.id } }]);
  });

  it("links a college reminder to its list entry (R3E-9)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const college = await factories.college(core.db, {
      name: "Maple State",
      deadlines: { ED: "2026-10-13", EA: null, REA: null, RD: null, rolling: false },
    });
    await addCollege(core, s.actor, { collegeId: college.id, fit: "target", plan: "ED" });
    const [entry] = await core.db.select().from(collegeList).where(eq(collegeList.ownerId, s.user.id));

    await handleRemindersDeadlines(deps, {});
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "deadline",
      body: "Due Oct 13. Plan time for it this week.",
      link: `/colleges/${entry?.id}`,
      dedupeKey: `reminder:college_list:${entry?.id}:2026-10-13:7`,
    });
  });

  it("sends a renewal reminder 30 days ahead with renewal copy and a link to the award (SC-11, D2)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const listing = await factories.scholarship(core.db, { name: "Maple Rotary", deadline: null });
    const [app] = await core.db
      .insert(scholarshipApplications)
      .values({
        ownerId: s.user.id,
        scholarshipId: listing.id,
        stage: "won",
        outcomeUsd: 2000,
        outcomeRenewable: true,
        outcomeAt: new Date("2025-11-05T15:00:00.000Z"),
      })
      .returning();

    await handleRemindersDeadlines(deps, {});
    core.jobs.sent.length = 0;
    await handleRemindersDeadlines(deps, {});
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "deadline",
      title: "Maple Rotary renewal is coming up",
      body: renewalBody("2026-11-05"),
      link: `/scholarships/${listing.slug}`,
      dedupeKey: `renewal:${app?.id}:2026`,
    });
    expect(renewalBody("2026-11-05")).toBe(
      "Your award renews around Nov 5. Check what the provider needs to renew it, like grades or a form, and plan time for it.",
    );
    expect(core.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: notes[0]?.id } }]);
  });

  it("texts only 1-day, non-renewal reminders, and only to students who opted in (NO-05)", async () => {
    const { deps, core } = makeWorkerDeps();
    const texter = await makeStudent(core.db);
    await updatePrefs(core, texter.actor, { smsEnabled: true, phone: PHONE });
    const tomorrow = await factories.scholarship(core.db, { name: "Tomorrow Award", deadline: "2026-10-07" });
    const later = await factories.scholarship(core.db, { name: "Three Day Award", deadline: "2026-10-09" });
    await saveScholarship(core, texter.actor, { scholarshipId: tomorrow.id });
    await saveScholarship(core, texter.actor, { scholarshipId: later.id });
    const renewing = await factories.scholarship(core.db, { name: "Maple Rotary", deadline: null });
    await core.db.insert(scholarshipApplications).values({
      ownerId: texter.user.id,
      scholarshipId: renewing.id,
      stage: "won",
      outcomeUsd: 2000,
      outcomeRenewable: true,
      outcomeAt: new Date("2025-11-05T15:00:00.000Z"),
    });
    const notOptedIn = await makeStudent(core.db);
    await saveScholarship(core, notOptedIn.actor, { scholarshipId: tomorrow.id });

    await handleRemindersDeadlines(deps, {});
    const mine = await core.db.select().from(notifications).where(eq(notifications.userId, texter.user.id));
    expect(mine).toHaveLength(3);
    const oneDay = mine.find((n) => n.dedupeKey.startsWith("reminder:") && n.dedupeKey.endsWith(":1"));
    expect(core.jobs.sent.filter((j) => j.name === "notify.sms")).toEqual([
      { name: "notify.sms", payload: { notificationId: oneDay?.id } },
    ]);
    expect(core.jobs.sent.filter((j) => j.name === "notify.email")).toHaveLength(4);
  });
});

describe("digest.weekly", () => {
  it("emails students whose digest day and hour match, once per week (NO-02)", async () => {
    const { deps, core } = makeWorkerDeps();
    const prefs = (userId: string, o: { digestDay: number; digestHour: number; emailEnabled?: boolean }) =>
      core.db.insert(notificationPrefs).values({ userId, updatedAt: new Date(TEST_NOW), ...o });
    const due = await makeStudent(core.db);
    await prefs(due.user.id, { digestDay: 2, digestHour: 10 });
    await addPlanItem(core, due.actor, item("Draft the Rotary essay"));
    const sundayPerson = await makeStudent(core.db);
    await addPlanItem(core, sundayPerson.actor, item("Log tutoring hours"));
    const optedOut = await makeStudent(core.db);
    await prefs(optedOut.user.id, { digestDay: 2, digestHour: 10, emailEnabled: false });
    await addPlanItem(core, optedOut.actor, item("Finish the FAFSA"));
    const quiet = await makeStudent(core.db);
    await prefs(quiet.user.id, { digestDay: 2, digestHour: 10 });

    await handleDigestWeekly(deps, {});
    await handleDigestWeekly(deps, {});

    const sent = await emailsTo(core.db, due.user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toMatch(/^Your week: 1 step/);
    expect(sent[0]?.text).toContain("Draft the Rotary essay");
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, due.user.id));
    expect(notes.map((n) => [n.kind, n.dedupeKey])).toEqual([["digest", `digest:${due.user.id}:2026-10-05`]]);
    for (const other of [sundayPerson, optedOut, quiet]) expect(await emailsTo(core.db, other.user.email)).toEqual([]);
    expect(core.jobs.sent.filter((j) => j.name === "notify.email")).toEqual([]);
  });

  it("waits out quiet hours: a 22:00 digest with quiet hours 21-7 goes at 07:00 (R2I-16)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await core.db.insert(notificationPrefs).values({
      userId: s.user.id,
      digestDay: 2,
      digestHour: 22,
      quietStartHour: 21,
      quietEndHour: 7,
      updatedAt: new Date(TEST_NOW),
    });
    await addPlanItem(core, s.actor, item("Draft the Rotary essay"));
    clock.set("2026-10-06T11:00:00.000Z"); // Tuesday 06:00 in Chicago: still quiet
    await handleDigestWeekly(deps, {});
    expect(await emailsTo(core.db, s.user.email)).toEqual([]);
    clock.set("2026-10-06T12:00:00.000Z"); // 07:00: quiet hours end
    await handleDigestWeekly(deps, {});
    clock.set("2026-10-07T03:00:00.000Z"); // 22:00 the same Tuesday: quiet again, and already sent
    await handleDigestWeekly(deps, {});
    expect(await emailsTo(core.db, s.user.email)).toHaveLength(1);
  });

  it("retracts the digest notification when the send fails, so the next hour retries once (R2I-16)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await core.db
      .insert(notificationPrefs)
      .values({ userId: s.user.id, digestDay: 2, digestHour: 10, updatedAt: new Date(TEST_NOW) });
    await addPlanItem(core, s.actor, item("Draft the Rotary essay"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(core.email, "send").mockRejectedValueOnce(new Error("resend down"));
    await handleDigestWeekly(deps, {});
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('"msg":"digest.failed"'));
    errors.mockRestore();
    const digests = () => core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(await digests()).toEqual([]);
    clock.set("2026-10-06T16:00:00.000Z"); // 11:00 in Chicago, still the digest day
    await handleDigestWeekly(deps, {});
    await handleDigestWeekly(deps, {});
    expect(await emailsTo(core.db, s.user.email)).toHaveLength(1);
    expect((await digests()).map((n) => n.dedupeKey)).toEqual([`digest:${s.user.id}:2026-10-05`]);
  });
});

describe("notify.email", () => {
  it("delivers a notification email once", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const note = await notify(core, SYSTEM, {
      userId: s.user.id,
      kind: "system",
      title: "Welcome to ScholarCrew",
      body: "Your crew is setting up.",
      link: "/week",
      dedupeKey: `welcome:${s.user.id}`,
      email: true,
    });
    expect(core.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: note?.id } }]);
    await handleNotifyEmail(deps, { notificationId: note?.id });
    await handleNotifyEmail(deps, { notificationId: note?.id });
    const sent = await emailsTo(core.db, s.user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Welcome to ScholarCrew");
  });
});

describe("notify.sms", () => {
  it("texts an opted-in student once through deps.sms (NO-05)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await updatePrefs(core, s.actor, { smsEnabled: true, phone: PHONE });
    const note = await notify(core, SYSTEM, {
      userId: s.user.id,
      kind: "deadline",
      title: "Maple County STEM Award is due tomorrow",
      body: "Due Oct 7.",
      link: "/scholarships",
      dedupeKey: `sms-test:${s.user.id}`,
      sms: true,
    });
    expect(core.jobs.sent).toEqual([{ name: "notify.sms", payload: { notificationId: note?.id } }]);
    await handleNotifySms(deps, { notificationId: note?.id });
    await handleNotifySms(deps, { notificationId: note?.id });
    const texts = await emailsTo(core.db, PHONE);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ subject: "SMS" });
    expect(texts[0]?.text).toMatch(/^ScholarCrew: Maple County STEM Award is due tomorrow .*Reply STOP to opt out\.$/);
    await expect(handleNotifySms(deps, { notificationId: "nope" })).rejects.toThrow();
  });
});
