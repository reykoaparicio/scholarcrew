import {
  AppError,
  type CrewReply,
  type SpecialistResult,
  type SpecialistRole,
  containsSensitiveTerm,
  isSensitiveFactKey,
} from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import type { AgentDeps } from "../context/port";
import { FAMILY_DEFAULT_ALLOWED } from "../guards/privacy";
import type { ModelTurn } from "../model/types";
import { JORDAN, createFakePort } from "../testing/fakePort";
import { createScriptedModelClient } from "../testing/scripted";
import { COMPASS_SYSTEM } from "./prompt";
import { createCompassSession, knownFromSnapshot } from "./session";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const S1 = JORDAN.scholarshipId;

function specialist(role: SpecialistRole, factsUsed: SpecialistResult["factsUsed"] = []): SpecialistResult {
  return { role, summary: `${role} summary`, proposedActions: [], factsUsed, uncertainty: [], needsPermission: [] };
}

async function setup() {
  const port = createFakePort();
  const snapshot = await port.snapshot(JORDAN.ownerId, "my_crew", "crew");
  const progress: string[] = [];
  const usage: string[] = [];
  const consult = vi.fn(async ({ role }: { role: SpecialistRole }) =>
    specialist(role, [
      {
        claim: "Deadline Oct 15",
        source: "catalog",
        refId: `scholarship:${S1}`,
        verifiedAt: JORDAN.scholarshipVerifiedAt,
      },
    ]),
  );
  const deps: AgentDeps = {
    model: createScriptedModelClient([]),
    port,
    consult,
    now: () => NOW,
    onProgress: async (e) => {
      progress.push(`${e.role}:${e.text}`);
    },
    onUsage: async (role) => {
      usage.push(role);
    },
  };
  const session = createCompassSession(deps, {
    ownerId: JORDAN.ownerId,
    audience: "crew",
    snapshot,
    allowed: FAMILY_DEFAULT_ALLOWED,
    submitName: "submit_reply",
  });
  const run = (name: string, input: unknown) => {
    const tool = session.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`missing tool ${name}`);
    return tool.run(input);
  };
  return { port, snapshot, consult, session, run, progress, usage };
}

describe("COMPASS_SYSTEM", () => {
  it("covers family, temporary, and context rooms, and the money, date, and receipt-link style (D42, D22, CR-08, R3E-12, R3E-4)", () => {
    expect(COMPASS_SYSTEM).toContain('Talk to the person who asked as "you".');
    expect(COMPASS_SYSTEM).toContain("shared information only");
    expect(COMPASS_SYSTEM).toContain("never propose confirm_fact or record_decision cards");
    expect(COMPASS_SYSTEM).toContain("If student_context.roomRef is set, the question is about that object.");
    expect(COMPASS_SYSTEM).toContain("($12,345)");
    expect(COMPASS_SYSTEM).toContain("(Oct 15)");
    expect(COMPASS_SYSTEM).toContain("sourceUrl and verifiedAt are null on every item except catalog items");
  });
});

describe("knownFromSnapshot", () => {
  it("collects facts, decisions, plan items, deadlines, and listed colleges", async () => {
    const { snapshot } = await setup();
    const known = knownFromSnapshot({ ...snapshot, roomRef: { type: "essay", id: JORDAN.essayId } });
    expect([...known.factIds]).toEqual([`fact:${JORDAN.factId}`, `fact:${JORDAN.majorFactId}`]);
    for (const ref of [
      `record:${JORDAN.decisionId}`,
      `record:${JORDAN.planItemId}`,
      `scholarship:${S1}`,
      `college:${JORDAN.collegeId}`,
      `essay:${JORDAN.essayId}`,
    ]) {
      expect(known.recordIds.has(ref), ref).toBe(true);
    }
  });
});

describe("createCompassSession", () => {
  it("offers one consult tool per enabled specialist plus the calculators", async () => {
    const { session } = await setup();
    expect(session.tools.map((t) => t.name)).toEqual([
      "consult_scout",
      "consult_atlas",
      "consult_quill",
      "consult_aid",
      "consult_ledger",
      "consult_prep",
      "consult_impact",
      "ledger_gap",
      "ledger_compare_offers",
      "ledger_loan_payment",
      "count_words",
      "days_until",
    ]);
  });

  it("consults through deps.consult, reports progress, and learns catalog sources from the port", async () => {
    const { session, run, consult, progress, port, snapshot } = await setup();
    const result = (await run("consult_scout", { question: "What's due soon?" })) as Record<string, unknown>;
    expect(consult).toHaveBeenCalledWith({
      role: "scout",
      question: "What's due soon?",
      ownerId: JORDAN.ownerId,
      audience: "crew",
      context: snapshot,
      onStudentTexts: expect.any(Function),
    });
    expect(progress).toEqual(["scout:Asking Scout…"]);
    expect(result.catalogSources).toEqual([
      { refId: `scholarship:${S1}`, sourceUrl: JORDAN.scholarshipSourceUrl, verifiedAt: JORDAN.scholarshipVerifiedAt },
    ]);
    expect(session.known.catalog.get(`scholarship:${S1}`)).toEqual({
      url: JORDAN.scholarshipSourceUrl,
      verifiedAt: JORDAN.scholarshipVerifiedAt,
    });
    expect(port.calls).toContain(`scholarship:${S1}`);
  });

  it("allows four consultations per run", async () => {
    const { run, consult } = await setup();
    for (const role of ["scout", "atlas", "quill", "aid"]) await run(`consult_${role}`, { question: "Anything?" });
    const fifth = run("consult_ledger", { question: "Anything?" });
    await expect(fifth).rejects.toBeInstanceOf(AppError);
    await expect(fifth).rejects.toThrow("Call submit_reply now");
    expect(consult).toHaveBeenCalledTimes(4);
  });

  it("registers each calculation as a citable calc id", async () => {
    const { run, session } = await setup();
    const result = (await run("ledger_gap", {
      costOfAttendanceUsd: 31_000,
      freeMoneyUsd: 21_800,
      pendingUsd: 1000,
    })) as { calcId: string };
    expect(result.calcId).toBe("calc:1");
    expect(session.known.calcs.has("calc:1")).toBe(true);
  });

  it("finishes replies with real contributors and drops what still fails the guards", async () => {
    const { run, session } = await setup();
    await run("consult_quill", { question: "Essay?" });
    await run("consult_scout", { question: "Due?" });
    const reply: CrewReply = {
      text: "Outline the essay tonight.",
      contributors: ["compass", "atlas"],
      question: null,
      actionCards: [],
      receipt: [
        { kind: "fact", label: "Travis County", refId: `fact:${JORDAN.factId}`, sourceUrl: null, verifiedAt: null },
        {
          kind: "fact",
          label: "Made up",
          refId: "fact:00000000-0000-4000-8000-000000000000",
          sourceUrl: null,
          verifiedAt: null,
        },
      ],
      safety: null,
      needsInput: false,
    };
    expect(session.check(reply)).toHaveLength(1);
    const done = session.finish(reply);
    expect(done.contributors).toEqual(["compass", "scout", "quill"]);
    expect(done.receipt).toHaveLength(1);
    expect(done.safety).toBe("partial");
    expect(session.consulted()).toEqual(["scout", "quill"]);
    expect(session.finish({ ...reply, receipt: [] }).safety).toBeNull();
  });

  it("reports usage for every turn", async () => {
    const { session, usage } = await setup();
    const turn: ModelTurn = {
      content: [],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 24 },
      model: "claude-opus-5-5",
      durationMs: 5,
    };
    session.onTurn(turn);
    session.onTurn(turn);
    await session.flush();
    expect(usage).toEqual(["compass", "compass"]);
  });

  it("logs a failed usage write instead of rejecting", async () => {
    const port = createFakePort();
    const snapshot = await port.snapshot(JORDAN.ownerId, "my_crew", "crew");
    const deps: AgentDeps = {
      model: createScriptedModelClient([]),
      port,
      consult: vi.fn(async ({ role }: { role: SpecialistRole }) => specialist(role)),
      now: () => NOW,
      onUsage: () => Promise.reject(new Error("insert failed")),
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const session = createCompassSession(deps, {
      ownerId: JORDAN.ownerId,
      audience: "crew",
      snapshot,
      allowed: FAMILY_DEFAULT_ALLOWED,
      submitName: "submit_plan",
    });
    const turn: ModelTurn = {
      content: [],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 24 },
      model: "claude-opus-5-5",
      durationMs: 5,
    };
    session.onTurn(turn);
    await expect(session.flush()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"msg":"agents.usage_failed"'));
    log.mockRestore();
  });

  it("names the run's submit tool in the consult-cap error", async () => {
    const port = createFakePort();
    const snapshot = await port.snapshot(JORDAN.ownerId, "my_crew", "crew");
    const deps: AgentDeps = {
      model: createScriptedModelClient([]),
      port,
      consult: vi.fn(async ({ role }: { role: SpecialistRole }) => specialist(role)),
      now: () => NOW,
    };
    const session = createCompassSession(deps, {
      ownerId: JORDAN.ownerId,
      audience: "crew",
      snapshot,
      allowed: FAMILY_DEFAULT_ALLOWED,
      submitName: "submit_plan",
    });
    const tool = (name: string) => session.tools.find((t) => t.name === name);
    for (const role of ["scout", "atlas", "quill", "aid"])
      await tool(`consult_${role}`)?.run({ question: "Anything?" });
    await expect(tool("consult_ledger")?.run({ question: "Anything?" })).rejects.toThrow("Call submit_plan now");
  });
});
