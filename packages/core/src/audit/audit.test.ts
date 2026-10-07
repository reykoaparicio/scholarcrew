import { auditEvents, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { PUBLIC_ACTOR } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import { recordAudit } from "./index";

describe("recordAudit", () => {
  it("stores user, helper, system, and public actors", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    const helperLinkId = "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f";
    await recordAudit(deps, { actor: actorOf(user), action: "sign_in", entityType: "user", entityId: user.id });
    await recordAudit(deps, {
      actor: { kind: "helper", helperLinkId, studentId: user.id, scope: ["activities"] },
      action: "helper_link_used",
      entityType: "helper_link",
      entityId: helperLinkId,
      meta: { scope: ["activities"] },
    });
    await recordAudit(deps, { actor: SYSTEM, action: "export_ready", entityType: "export", entityId: "e1" });
    await recordAudit(deps, { actor: PUBLIC_ACTOR, action: "viewed", entityType: "page", entityId: "p1" });
    const rows = await deps.db.select().from(auditEvents);
    expect(Object.fromEntries(rows.map((r) => [r.actorKind, r.actorId]))).toEqual({
      user: user.id,
      helper: helperLinkId,
      system: null,
      public: null,
    });
    const [helper] = await deps.db.select().from(auditEvents).where(eq(auditEvents.actorKind, "helper"));
    expect(helper?.meta).toEqual({ scope: ["activities"] });
    expect(rows[0]?.createdAt.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });
});
