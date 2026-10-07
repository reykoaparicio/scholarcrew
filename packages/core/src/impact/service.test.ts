import { auditEvents, eq, serviceLogs } from "@scholarcrew/db";
import type { ServiceLogInput } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeParentOf, makeStudent, setShare, setup } from "../scholarships/testkit";
import { addServiceLog, deleteServiceLog, listServiceLogs, updateServiceLog } from "./service";
import { getVerificationRequest, requestVerification, submitVerification } from "./verification";

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

const log = (o: Partial<ServiceLogInput> = {}): ServiceLogInput => ({
  organization: "Maple Public Library",
  activity: "STEM night",
  servedOn: "2026-09-12",
  minutes: 150,
  supervisorName: "Ms. Ortiz",
  supervisorEmail: "ortiz@library.example",
  reflection: "",
  ...o,
});

const tokenFrom = (text: string | undefined) => /verify-hours\/(\S+)/.exec(text ?? "")?.[1] ?? "";

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
});

describe("service logs", () => {
  it("adds, lists newest first, updates, and deletes", async () => {
    await addServiceLog(ctx.deps, student.actor, log({ servedOn: "2026-08-01" }));
    const b = await addServiceLog(ctx.deps, student.actor, log());
    expect(b).toMatchObject({
      verification: "self_reported",
      minutes: 150,
      verifiedAt: null,
      verificationExpiresAt: null,
    });
    expect((await listServiceLogs(ctx.deps, student.actor, student.user.id)).map((l) => l.servedOn)).toEqual([
      "2026-09-12",
      "2026-08-01",
    ]);
    expect((await updateServiceLog(ctx.deps, student.actor, b.id, { reflection: "Kids loved it" })).reflection).toBe(
      "Kids loved it",
    );
    await deleteServiceLog(ctx.deps, student.actor, b.id);
    expect(await listServiceLogs(ctx.deps, student.actor, student.user.id)).toHaveLength(1);
  });

  it("drops verification when verified details change", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    await ctx.deps.db
      .update(serviceLogs)
      .set({ verification: "verified", verifiedAt: new Date() })
      .where(eq(serviceLogs.id, a.id));
    expect((await updateServiceLog(ctx.deps, student.actor, a.id, { reflection: "ok" })).verification).toBe("verified");
    const changed = await updateServiceLog(ctx.deps, student.actor, a.id, { minutes: 240 });
    expect(changed).toMatchObject({ verification: "self_reported", verifiedAt: null, minutes: 240 });
  });

  it("follows the activities share for parents and stays owner-only for writes", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    const parent = await makeParentOf(ctx.deps, student.user.id);
    expect(await listServiceLogs(ctx.deps, parent.actor, student.user.id)).toHaveLength(1);
    await expect(updateServiceLog(ctx.deps, parent.actor, a.id, { minutes: 1 })).rejects.toMatchObject({
      code: "not_found",
    });
    await setShare(ctx.deps, student.user.id, "activities", false);
    await expect(listServiceLogs(ctx.deps, parent.actor, student.user.id)).rejects.toMatchObject({ code: "not_found" });
    const other = await makeStudent(ctx.deps);
    await expect(deleteServiceLog(ctx.deps, other.actor, a.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("supervisor verification", () => {
  it("needs a supervisor email", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log({ supervisorEmail: "" }));
    await expect(requestVerification(ctx.deps, student.actor, a.id)).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("emails a 14-day link with the first name only, then records the supervisor's answer once", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    const requested = await requestVerification(ctx.deps, student.actor, a.id);
    expect(requested).toMatchObject({ verification: "requested", verificationExpiresAt: "2026-10-20T15:00:00.000Z" });
    expect((await listServiceLogs(ctx.deps, student.actor, student.user.id))[0]?.verificationExpiresAt).toBe(
      "2026-10-20T15:00:00.000Z",
    );
    expect(ctx.mails).toHaveLength(1);
    const mail = ctx.mails[0];
    expect(mail?.to).toBe("ortiz@library.example");
    expect(mail?.text).toContain(`${ctx.deps.config.appUrl}/verify-hours/`);
    expect(mail?.text).toContain("Test");
    expect(mail?.text).not.toContain("Test Student");
    // R3E-8: calendar dates read "Sep 12"; the expiry is an instant in the student's zone, with the zone named.
    expect(mail?.text).toContain("STEM night on Sep 12: 2.5 hours");
    expect(mail?.text).toContain("The link expires Oct 20, 2026, 10:00 AM CDT.");
    expect(mail?.text).not.toContain("2026-10-20");
    const token = tokenFrom(mail?.text);
    const [stored] = await ctx.deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, a.id));
    expect(stored?.verificationTokenHash).not.toBe(token);
    expect(stored?.verificationExpiresAt?.toISOString()).toBe("2026-10-20T15:00:00.000Z");

    expect(await getVerificationRequest(ctx.deps, token)).toEqual({
      studentFirstName: "Test",
      organization: "Maple Public Library",
      activity: "STEM night",
      servedOn: "2026-09-12",
      minutes: 150,
      expiresAt: "2026-10-20T15:00:00.000Z",
    });
    expect(await getVerificationRequest(ctx.deps, "wrong-token")).toBeNull();

    await submitVerification(ctx.deps, token, { confirmed: true, note: "Thanks, Maya!" });
    const [done] = await ctx.deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, a.id));
    expect(done).toMatchObject({
      verification: "verified",
      verifierNote: "Thanks, Maya!",
      verificationTokenHash: null,
    });
    expect(done?.verifiedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(await getVerificationRequest(ctx.deps, token)).toBeNull();
    await expect(submitVerification(ctx.deps, token, { confirmed: false, note: "" })).rejects.toMatchObject({
      code: "not_found",
    });
    const audits = await ctx.deps.db.select().from(auditEvents).where(eq(auditEvents.entityId, a.id));
    expect(audits.map((e) => e.action)).toContain("service_log.verified");
    await expect(requestVerification(ctx.deps, student.actor, a.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("expires after 14 days and records declines", async () => {
    const a = await addServiceLog(ctx.deps, student.actor, log());
    await requestVerification(ctx.deps, student.actor, a.id);
    const oldToken = tokenFrom(ctx.mails[0]?.text);
    ctx.clock.set("2026-10-21T15:00:00.000Z");
    expect(await getVerificationRequest(ctx.deps, oldToken)).toBeNull();
    const [lapsed] = await listServiceLogs(ctx.deps, student.actor, student.user.id);
    expect(lapsed).toMatchObject({ verification: "requested", verificationExpiresAt: "2026-10-20T15:00:00.000Z" });
    await expect(submitVerification(ctx.deps, oldToken, { confirmed: true, note: "" })).rejects.toMatchObject({
      code: "not_found",
    });
    const resent = await requestVerification(ctx.deps, student.actor, a.id);
    expect(resent.verificationExpiresAt).toBe("2026-11-04T15:00:00.000Z");
    const fresh = tokenFrom(ctx.mails[1]?.text);
    expect(fresh).not.toBe(oldToken);
    await submitVerification(ctx.deps, fresh, { confirmed: false, note: "Wrong date" });
    const [row] = await ctx.deps.db.select().from(serviceLogs).where(eq(serviceLogs.id, a.id));
    expect(row).toMatchObject({ verification: "declined", verifiedAt: null, verifierNote: "Wrong date" });
  });
});
