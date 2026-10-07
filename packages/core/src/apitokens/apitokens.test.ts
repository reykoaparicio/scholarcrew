import { apiTokens, auditEvents, eq, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ApiTokenScope } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { actorOf } from "../../test/helpers";
import { sha256Hex } from "../crypto";
import { createTestDeps, fixedClock } from "../shared";
import { createApiToken, listApiTokens, resolveApiToken, revokeApiToken } from "./index";

const input = { label: "Chrome on my laptop", scopes: ["autofill", "save_page"] as ApiTokenScope[] };

describe("api tokens", () => {
  it("shows the secret once and stores only its hash", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createApiToken(deps, actorOf(user), input);
    expect(created.secret).toMatch(/^sct_[A-Za-z0-9_-]{43}$/);
    expect(created.token).toMatchObject({ label: "Chrome on my laptop", lastUsedAt: null, revokedAt: null });
    const [row] = await deps.db.select().from(apiTokens);
    expect(row?.tokenHash).toBe(sha256Hex(created.secret));
    const listed = await listApiTokens(deps, actorOf(user));
    expect(listed).toEqual([created.token]);
    expect(JSON.stringify(listed)).not.toContain(created.secret);
  });

  it("resolves a live bearer to the user actor and scopes", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createApiToken(deps, actorOf(user), { label: "Laptop", scopes: ["autofill"] });
    expect(await resolveApiToken(deps, created.secret)).toEqual({
      actor: { kind: "user", userId: user.id, role: "student" },
      scopes: ["autofill"],
    });
    const [row] = await deps.db.select().from(apiTokens);
    expect(row?.lastUsedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("returns null for revoked, unknown, or malformed tokens and inactive users", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const a = await createApiToken(deps, actorOf(user), input);
    await revokeApiToken(deps, actorOf(user), a.token.id);
    expect(await resolveApiToken(deps, a.secret)).toBeNull();
    expect(await resolveApiToken(deps, "sct_unknown")).toBeNull();
    expect(await resolveApiToken(deps, "Bearer abc")).toBeNull();
    const b = await createApiToken(deps, actorOf(user), input);
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await resolveApiToken(deps, b.secret)).toBeNull();
  });

  it("keeps tokens private to their owner", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const created = await createApiToken(deps, actorOf(user), input);
    expect(await listApiTokens(deps, actorOf(other))).toEqual([]);
    await expect(revokeApiToken(deps, actorOf(other), created.token.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates label and scopes", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(createApiToken(deps, actorOf(user), { ...input, label: "" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      createApiToken(deps, actorOf(user), { label: "x", scopes: ["admin"] as unknown as ApiTokenScope[] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("token expiry and role", () => {
  it("refuses a parent and expires a student token after 180 days", async () => {
    const clock = fixedClock("2026-10-06T15:00:00Z");
    const deps = createTestDeps({ clock });
    const parent = await factories.parent(deps.db);
    const { user } = await factories.student(deps.db);
    await expect(
      createApiToken(deps, actorOf(parent), { label: "Parent", scopes: ["autofill"] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const minted = await createApiToken(deps, actorOf(user), { label: "Laptop", scopes: ["autofill"] });
    expect(minted.token.expiresAt).toBe("2027-04-04T15:00:00.000Z");
    clock.set("2027-04-05T15:00:00Z");
    expect(await resolveApiToken(deps, minted.secret)).toBeNull();
    await revokeApiToken(deps, actorOf(user), minted.token.id);
    const audit = await deps.db.select().from(auditEvents).where(eq(auditEvents.entityId, minted.token.id));
    expect(audit.map((row) => row.action).sort()).toEqual(["api_token_created", "api_token_revoked"]);
  });
});
