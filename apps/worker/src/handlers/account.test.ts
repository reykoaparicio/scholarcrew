import { deleteAccount, getExport, requestExport } from "@scholarcrew/core/account";
import { createConversation } from "@scholarcrew/core/crew";
import { conversations, eq, users } from "@scholarcrew/db";
import { describe, expect, it } from "vitest";
import { makeStudent, makeWorkerDeps } from "../../test/helpers";
import { handleAccountExport } from "./account-export";
import { handleAccountPurge } from "./account-purge";
import { handleMaintenancePurge } from "./maintenance-purge";

describe("account.export", () => {
  it("builds the export once (ME-08)", async () => {
    const { deps, core } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const record = await requestExport(core, s.actor);
    expect(core.jobs.sent).toEqual([{ name: "account.export", payload: { exportId: record.id } }]);
    await handleAccountExport(deps, { exportId: record.id });
    await handleAccountExport(deps, { exportId: record.id });
    const ready = await getExport(core, s.actor, record.id);
    expect(ready.record.status).toBe("ready");
    expect(ready.bytes).not.toBeNull();
    expect(JSON.parse(ready.bytes?.toString("utf8") ?? "{}")).toHaveProperty("markdown");
  });
});

describe("account.purge", () => {
  it("hard-deletes accounts after the six-day cutoff and keeps everyone else (ID-05)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const gone = await makeStudent(core.db);
    const stays = await makeStudent(core.db);
    await deleteAccount(core, gone.actor);
    await handleAccountPurge(deps, {});
    expect(await core.db.select().from(users).where(eq(users.id, gone.user.id))).toHaveLength(1);
    clock.set("2026-10-13T15:00:01.000Z");
    await handleAccountPurge(deps, {});
    expect(await core.db.select().from(users).where(eq(users.id, gone.user.id))).toEqual([]);
    expect(await core.db.select().from(users).where(eq(users.id, stays.user.id))).toHaveLength(1);
  });
});

describe("maintenance.purge", () => {
  it("deletes expired temporary chats and keeps regular rooms (SE-07)", async () => {
    const { deps, core, clock } = makeWorkerDeps();
    const s = await makeStudent(core.db);
    const temp = await createConversation(core, s.actor, {
      room: "temporary",
      roomRefId: null,
      familyId: null,
      title: "",
    });
    const mine = await createConversation(core, s.actor, {
      room: "my_crew",
      roomRefId: null,
      familyId: null,
      title: "",
    });
    await handleMaintenancePurge(deps, {});
    expect(await core.db.select().from(conversations).where(eq(conversations.id, temp.id))).toHaveLength(1);
    clock.set("2026-10-08T15:00:00.000Z");
    await handleMaintenancePurge(deps, {});
    expect(await core.db.select().from(conversations).where(eq(conversations.id, temp.id))).toEqual([]);
    expect(await core.db.select().from(conversations).where(eq(conversations.id, mine.id))).toHaveLength(1);
  });

  it("rejects payloads with unknown keys", async () => {
    const { deps } = makeWorkerDeps();
    await expect(handleMaintenancePurge(deps, { all: true })).rejects.toThrow();
    await expect(handleAccountPurge(deps, { all: true })).rejects.toThrow();
  });
});
