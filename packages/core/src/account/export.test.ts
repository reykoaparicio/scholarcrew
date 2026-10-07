import { activities, auditEvents, blobs, eq, essayVersions, familyTasks, notifications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import * as documentsModule from "../documents";
import { uploadDocument } from "../documents";
import { createFact } from "../memory";
import { createTestDeps, fixedClock } from "../shared";
import { buildExport, getExport, latestExport, requestExport } from "./export";

describe("account export", () => {
  it("queues an export and its job", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const record = await requestExport(deps, actorOf(user));
    expect(record).toMatchObject({
      status: "queued",
      expiresAt: null,
      downloadUrl: null,
      createdAt: "2026-10-06T15:00:00.000Z",
    });
    expect(deps.jobs.sent).toEqual([{ name: "account.export", payload: { exportId: record.id } }]);
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "export_requested"))).toHaveLength(1);
  });

  it("builds one encrypted JSON + Markdown file of everything the student owns", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), {
      key: "county",
      value: "Maple",
      visibility: "crew",
      source: "user_stated",
      sourceRef: null,
    });
    await factories.story(deps.db, user.id, { title: "Library STEM night" });
    await factories.story(deps.db, other.id, { title: "Other kid story" });
    const essay = await factories.essay(deps.db, user.id, { title: "Why engineering", currentVersion: 2 });
    await deps.db.insert(essayVersions).values([
      { essayId: essay.id, version: 1, body: "An early attempt.", wordCount: 3, authorId: user.id },
      { essayId: essay.id, version: 2, body: "Second draft body.", wordCount: 3, authorId: user.id },
    ]);
    await deps.db.insert(activities).values({ ownerId: user.id, position: 1, name: "Robotics team", role: "Captain" });
    const record = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    const { record: ready, bytes } = await getExport(deps, actorOf(user), record.id);
    expect(ready).toMatchObject({
      status: "ready",
      expiresAt: "2026-10-07T15:00:00.000Z",
      downloadUrl: `/api/v1/account/exports/${record.id}`,
    });
    const text = bytes?.toString("utf8") ?? "";
    const file = JSON.parse(text) as {
      generatedAt: string;
      data: Record<string, Array<Record<string, unknown>>>;
      markdown: string;
    };
    expect(file.generatedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(file.data.memoryFacts).toHaveLength(1);
    expect(file.data.stories?.map((s) => s.title)).toEqual(["Library STEM night"]);
    expect(file.data.essayVersions).toHaveLength(2);
    expect(file.markdown).toContain("## Stories");
    expect(file.markdown).toContain("Library STEM night");
    expect(file.markdown).toContain("Second draft body.");
    expect(file.markdown).not.toContain("An early attempt.");
    expect(file.markdown).toContain("Robotics team");
    expect(file.markdown).toContain("county: Maple");
    expect(text).not.toContain("Other kid story");
    expect(text).not.toContain("tokenHash");
    const stored = await deps.db.select().from(blobs);
    expect(stored.some((b) => b.ciphertext.includes(Buffer.from("Library STEM night")))).toBe(false);
  });

  it("is visible only to its owner and expires after 24 hours", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const record = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    await expect(getExport(deps, actorOf(other), record.id)).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-07T16:00:00.000Z");
    await expect(getExport(deps, actorOf(user), record.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("buildExport is system-only and runs once", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const record = await requestExport(deps, actorOf(user));
    await expect(buildExport(deps, actorOf(user), record.id, { lastAttempt: true })).rejects.toMatchObject({
      code: "forbidden",
    });
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    expect(await deps.db.select().from(blobs)).toHaveLength(1);
  });

  it("latestExport returns the owner's newest unexpired export", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    expect(await latestExport(deps, actorOf(user))).toBeNull();
    const first = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, first.id, { lastAttempt: true });
    clock.set("2026-10-06T16:00:00.000Z");
    const second = await requestExport(deps, actorOf(user));
    const theirs = await requestExport(deps, actorOf(other));
    expect(await latestExport(deps, actorOf(user))).toMatchObject({ id: second.id, status: "queued" });
    expect((await latestExport(deps, actorOf(other)))?.id).toBe(theirs.id);
    await buildExport(deps, SYSTEM, second.id, { lastAttempt: true });
    expect(await latestExport(deps, actorOf(user))).toMatchObject({ id: second.id, status: "ready" });
    clock.set("2026-10-07T17:00:00.000Z");
    expect(await latestExport(deps, actorOf(user))).toBeNull();
    await expect(latestExport(deps, SYSTEM)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("lists uploaded files and notifies once when ready (R2I-18)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await uploadDocument(deps, actorOf(user), {
      kind: "transcript",
      filename: "transcript.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-1.7 transcript"),
    });
    const record = await requestExport(deps, actorOf(user));
    const enqueueFailure = vi.spyOn(deps.jobs, "enqueue").mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(buildExport(deps, SYSTEM, record.id, { lastAttempt: true })).rejects.toThrow("queue unavailable");
    expect((await latestExport(deps, actorOf(user)))?.status).toBe("ready");
    enqueueFailure.mockRestore();
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    const { bytes } = await getExport(deps, actorOf(user), record.id);
    const file = JSON.parse(bytes?.toString("utf8") ?? "{}") as { markdown: string };
    expect(file.markdown).toContain("## Files you uploaded");
    expect(file.markdown).toContain("- transcript.pdf (transcript, 19 bytes)");
    expect(file.markdown).toContain("Download these from Settings → Documents.");
    const notes = await deps.db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(notes.map((n) => [n.kind, n.title, n.body, n.link, n.dedupeKey])).toEqual([
      [
        "system",
        "Your export is ready",
        "It's ready to download for 24 hours.",
        "/settings#data",
        `export:${record.id}`,
      ],
    ]);
    expect(deps.jobs.sent.filter((j) => j.name === "notify.email")).toEqual([
      { name: "notify.email", payload: { notificationId: notes[0]?.id } },
      { name: "notify.email", payload: { notificationId: notes[0]?.id } },
    ]);
  });

  it("adds sharing choices and family tasks, and dates facts in the student's zone (R3E-11, R3E-8)", async () => {
    // 02:00 UTC on Oct 7 is 9 pm on Oct 6 in Chicago.
    const deps = createTestDeps({ clock: fixedClock("2026-10-07T02:00:00.000Z") });
    const { user } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    await deps.db.insert(familyTasks).values([
      {
        familyId: family.id,
        assigneeId: parent.id,
        studentId: user.id,
        kind: "custom",
        title: "Gather tax documents",
        createdAt: deps.clock.now(),
      },
      {
        familyId: family.id,
        assigneeId: user.id,
        studentId: user.id,
        kind: "custom",
        title: "Ask Dana about the budget",
        status: "done",
        createdAt: deps.clock.now(),
      },
    ]);
    await createFact(deps, actorOf(user), {
      key: "county",
      value: "Maple",
      visibility: "crew",
      source: "user_stated",
      sourceRef: null,
    });
    const record = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    const { bytes } = await getExport(deps, actorOf(user), record.id);
    const file = JSON.parse(bytes?.toString("utf8") ?? "{}") as {
      data: Record<string, Array<Record<string, unknown>>>;
      markdown: string;
    };
    expect(file.data.shareSettings).toHaveLength(9);
    expect(file.data.familyTasks?.map((t) => t.title).sort()).toEqual([
      "Ask Dana about the budget",
      "Gather tax documents",
    ]);
    expect(file.markdown.startsWith("# ScholarCrew export")).toBe(true);
    expect(file.markdown).toContain("## Sharing with family");
    expect(file.markdown).toContain("- deadlines: on");
    expect(file.markdown).toContain("- essays: off");
    expect(file.markdown).toContain("## Family tasks");
    expect(file.markdown).toContain("- Gather tax documents (todo)");
    expect(file.markdown).toContain("- Ask Dana about the budget (done)");
    expect(file.markdown).toContain("county: Maple (user_stated, 2026-10-06)");
  });
});

describe("export retry and reuse", () => {
  it("reuses the queued request and marks failed only on the last attempt", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const first = await requestExport(deps, actorOf(user));
    const concurrent = await Promise.all([requestExport(deps, actorOf(user)), requestExport(deps, actorOf(user))]);
    expect(concurrent.map((row) => row.id)).toEqual([first.id, first.id]);
    const failure = vi.spyOn(documentsModule, "putBlob").mockRejectedValue(new Error("disk unavailable"));
    try {
      await expect(buildExport(deps, SYSTEM, first.id, { lastAttempt: false })).rejects.toThrow("disk unavailable");
      expect((await latestExport(deps, actorOf(user)))?.status).toBe("queued");
      await expect(buildExport(deps, SYSTEM, first.id, { lastAttempt: true })).rejects.toThrow("disk unavailable");
      const last = await latestExport(deps, actorOf(user));
      expect(last?.status).toBe("failed");
      expect(last?.expiresAt).toBe("2026-10-07T15:00:00.000Z");
    } finally {
      failure.mockRestore();
    }
  });
});
