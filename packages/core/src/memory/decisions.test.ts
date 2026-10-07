import { randomUUID } from "node:crypto";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import { deleteDecision, listDecisions, recordDecision } from "./decisions";

describe("decisions", () => {
  it("records and lists the student's decisions with a date and reason", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const d = await recordDecision(deps, actorOf(user), {
      summary: "Skip ED at Northgate",
      rationale: "Wants to compare aid",
    });
    expect(d).toMatchObject({
      summary: "Skip ED at Northgate",
      rationale: "Wants to compare aid",
      decidedAt: "2026-10-06T15:00:00.000Z",
      sourceMessageId: null,
    });
    expect(await listDecisions(deps, actorOf(user), user.id)).toEqual([d]);
    expect(await listDecisions(deps, SYSTEM, user.id)).toHaveLength(1);
  });

  it("hides decisions from other users and parents", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    await recordDecision(deps, actorOf(user), { summary: "Skip ED", rationale: "" });
    await expect(listDecisions(deps, actorOf(parent), user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only the owner delete", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const d = await recordDecision(deps, actorOf(user), { summary: "Skip ED", rationale: "" });
    await expect(deleteDecision(deps, actorOf(other), d.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteDecision(deps, actorOf(user), d.id);
    expect(await listDecisions(deps, actorOf(user), user.id)).toEqual([]);
  });

  it("validates input", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(recordDecision(deps, actorOf(user), { summary: "", rationale: "" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("stores the chat message a decision came from (R2I-12)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const messageId = randomUUID();
    const d = await recordDecision(deps, actorOf(user), { summary: "Apply EA to State U", rationale: "" }, messageId);
    expect(d.sourceMessageId).toBe(messageId);
    expect((await listDecisions(deps, actorOf(user), user.id))[0]?.sourceMessageId).toBe(messageId);
    await expect(
      recordDecision(deps, actorOf(user), { summary: "x", rationale: "" }, "not-a-message"),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
