import { eq, notifications, profiles, scholarshipApplications, sweepRuns, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleSweepStudent } from "./sweep-student";
import { handleSweepWeekly, sweepKey } from "./sweep-weekly";

describe("sweep.weekly", () => {
  it("queues one sweep per active, onboarded student with a weekly singleton key (SC-10)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    clock.set("2026-10-11T14:00:00.000Z"); // Sunday 09:00 in Chicago, Monday 04:00 in Kiritimati
    const a = await makeStudent(core.db);
    const b = await makeStudent(core.db);
    await core.db.update(users).set({ timeZone: "Pacific/Kiritimati" }).where(eq(users.id, b.user.id));
    const notOnboarded = await makeStudent(core.db);
    await core.db
      .update(profiles)
      .set({ onboardingCompletedAt: null })
      .where(eq(profiles.userId, notOnboarded.user.id));
    const deleted = await makeStudent(core.db);
    await core.db.update(users).set({ status: "deleted", deletedAt: clock.now() }).where(eq(users.id, deleted.user.id));
    await factories.parent(core.db);

    await handleSweepWeekly(deps, {});
    const sent = [...core.jobs.sent].sort((x, y) =>
      String((x.payload as { studentId: string }).studentId).localeCompare(
        String((y.payload as { studentId: string }).studentId),
      ),
    );
    const expected = [
      { id: a.user.id, week: "2026-10-05" },
      { id: b.user.id, week: "2026-10-12" },
    ].sort((x, y) => x.id.localeCompare(y.id));
    expect(sent).toEqual(
      expected.map((e) => ({
        name: "sweep.student",
        payload: { studentId: e.id },
        opts: { singletonKey: sweepKey(e.id, e.week) },
      })),
    );
    expect(sweepKey(a.user.id, "2026-10-05")).toBe(`sweep:${a.user.id}:2026-10-05`);
  });

  it("rejects a payload with unknown keys", async () => {
    const { deps } = makeWorkerDeps();
    await expect(handleSweepWeekly(deps, { extra: 1 })).rejects.toThrow();
  });
});

describe("sweep.student", () => {
  it("adds new matches once and notifies the student", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await factories.scholarship(core.db, { name: "National STEM Award" });
    await handleSweepStudent(deps, { studentId: s.user.id });
    await handleSweepStudent(deps, { studentId: s.user.id });
    const apps = await core.db
      .select()
      .from(scholarshipApplications)
      .where(eq(scholarshipApplications.ownerId, s.user.id));
    expect(apps.map((x) => x.stage)).toEqual(["matched"]);
    const notes = await core.db.select().from(notifications).where(eq(notifications.userId, s.user.id));
    expect(notes.map((n) => n.kind)).toEqual(["new_matches"]);
    expect(await core.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, s.user.id))).toHaveLength(1);
  });

  it("skips deleted students", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    await core.db.update(users).set({ status: "deleted" }).where(eq(users.id, s.user.id));
    await handleSweepStudent(deps, { studentId: s.user.id });
    expect(await core.db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, s.user.id))).toEqual([]);
  });
});
