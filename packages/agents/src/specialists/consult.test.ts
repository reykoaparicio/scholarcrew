import { type ProgressEvent, SpecialistResult, type SpecialistRole } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { wrapUntrusted } from "../context";
import type { ModelRequest } from "../model/types";
import { JORDAN, type ScriptedTurn, createFakePort, createScriptedModelClient, jordanData } from "../testing";
import { COULDNT_FINISH_SUMMARY, INTEGRITY_SUMMARY, consultSpecialist, makeConsult } from "./consult";
import { SPECIALISTS } from "./definitions";
import type { SpecialistDeps } from "./shared";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, k) => `${prefix}${k}`).join(" ");

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("empty fixture");
  return item;
}

function setup(script: ScriptedTurn[] | ((req: ModelRequest) => ScriptedTurn), port = createFakePort()) {
  const model = createScriptedModelClient(script);
  const progress: ProgressEvent[] = [];
  const usage: string[] = [];
  const deps: SpecialistDeps = {
    model,
    port,
    now: () => NOW,
    onProgress: async (e) => {
      progress.push(e);
    },
    onUsage: async (role) => {
      usage.push(role);
    },
  };
  return { model, port, deps, progress, usage };
}

async function input(role: SpecialistRole, audience: "crew" | "family" = "crew") {
  const context = await createFakePort().snapshot(JORDAN.ownerId, "my_crew", audience);
  return { role, question: "What's due soon?", ownerId: JORDAN.ownerId, audience, context };
}

const result = (o: Partial<SpecialistResult> = {}): SpecialistResult => ({
  role: "scout",
  summary: "The Hill Country STEM Award is due Oct 15.",
  proposedActions: [],
  factsUsed: [
    {
      claim: "Deadline Oct 15",
      source: "catalog",
      refId: `scholarship:${JORDAN.scholarshipId}`,
      verifiedAt: JORDAN.scholarshipVerifiedAt,
    },
  ],
  uncertainty: [],
  needsPermission: [],
  ...o,
});
const submit = (r: SpecialistResult) => ({ type: "tool_use" as const, name: "submit_result", input: r });
const call = (name: string, args: unknown = {}) => ({ type: "tool_use" as const, name, input: args });

type ResultBlock = { content: string; is_error?: boolean };

describe("consultSpecialist", () => {
  it("runs the role's prompt, tools, and wrapped context, and returns the submitted result", async () => {
    const { deps, model, port, progress, usage } = setup([
      { content: [call("get_matches")] },
      { content: [submit(result())] },
    ]);
    const i = await input("scout");
    expect(await consultSpecialist(deps, i)).toEqual(result());
    const req = model.requests[0];
    expect(req).toMatchObject({ role: "scout", system: SPECIALISTS.scout.system, effort: "medium", maxTokens: 16_000 });
    expect(req?.tools.map((t) => t.name)).toEqual([
      "get_matches",
      "search_scholarships",
      "get_scholarship",
      "get_deadlines",
      "submit_result",
    ]);
    expect(req?.messages[0]).toEqual({
      role: "user",
      content: [
        wrapUntrusted("student_context", JSON.stringify(i.context)),
        { type: "text", text: "What's due soon?" },
      ],
    });
    expect(port.calls).toEqual(["matches:crew"]);
    expect(progress).toEqual([{ at: NOW.toISOString(), role: "scout", text: "Scout is checking…" }]);
    expect(usage).toEqual(["scout", "scout"]);
  });

  it("forces the role to the specialist that was asked", async () => {
    const { deps } = setup([{ content: [submit(result({ role: "atlas" }))] }]);
    expect((await consultSpecialist(deps, await input("scout"))).role).toBe("scout");
  });

  it("passes the audience to its tools", async () => {
    const { deps, port } = setup([{ content: [call("get_matches")] }, { content: [submit(result())] }]);
    await consultSpecialist(deps, await input("scout", "family"));
    expect(port.calls).toEqual(["matches:family"]);
  });

  it("returns a safe result on a refusal", async () => {
    const { deps } = setup([{ stopReason: "refusal" }]);
    const out = await consultSpecialist(deps, await input("prep"));
    expect(out).toEqual({
      role: "prep",
      summary: COULDNT_FINISH_SUMMARY,
      proposedActions: [],
      factsUsed: [],
      uncertainty: [expect.stringContaining("declined")],
      needsPermission: [],
    });
    expect(SpecialistResult.safeParse(out).success).toBe(true);
  });

  it("returns a safe result when it runs out of rounds", async () => {
    const { deps, model } = setup(() => ({ content: [call("get_test_scores")] }));
    const out = await consultSpecialist(deps, await input("prep"));
    expect(model.requests).toHaveLength(4);
    expect(out).toMatchObject({
      role: "prep",
      summary: COULDNT_FINISH_SUMMARY,
      uncertainty: [expect.stringContaining("ran out of time")],
    });
  });

  it("retries one invalid submit_result, and returns a safe result after two (R3E-3)", async () => {
    const invalid = { type: "tool_use" as const, name: "submit_result", input: { ...result(), uncertainty: "none" } };
    const once = setup([{ content: [invalid] }, { content: [submit(result())] }]);
    expect(await consultSpecialist(once.deps, await input("scout"))).toEqual(result());
    expect(once.model.requests[0]?.tools.at(-1)).toMatchObject({ name: "submit_result", strict: false });
    const twice = setup([{ content: [invalid] }, { content: [invalid] }]);
    const out = await consultSpecialist(twice.deps, await input("scout"));
    expect(twice.model.requests).toHaveLength(2);
    expect(out).toEqual({
      role: "scout",
      summary: COULDNT_FINISH_SUMMARY,
      proposedActions: [],
      factsUsed: [],
      uncertainty: ["My answer didn't pass the format check, so nothing in it is confirmed."],
      needsPermission: [],
    });
    const feedback = twice.model.requests[1]?.messages[2]?.content as ResultBlock[];
    expect(feedback[0]).toMatchObject({ is_error: true, content: expect.stringContaining("uncertainty: ") });
  });

  it("Quill: quoting the student's stories passes the integrity guard", async () => {
    const story = first(jordanData().stories);
    const summary = `Ask about "${story.moment}" What did you do first?`;
    const { deps, model, port } = setup([{ content: [submit(result({ role: "quill", summary }))] }]);
    const out = await consultSpecialist(deps, await input("quill"));
    expect(out.summary).toBe(summary);
    expect(model.requests).toHaveLength(1);
    expect(port.calls).toEqual(["stories"]);
  });

  it("Quill: asks once to fix ghostwritten text, then replaces it", async () => {
    const { deps, model } = setup([
      { content: [submit(result({ role: "quill", summary: words("new", 30) }))] },
      { content: [submit(result({ role: "quill", summary: words("more", 40) }))] },
    ]);
    const out = await consultSpecialist(deps, await input("quill"));
    expect(out.summary).toBe(INTEGRITY_SUMMARY);
    expect(out.role).toBe("quill");
    expect(model.requests).toHaveLength(2);
    const feedback = model.requests[1]?.messages[2]?.content as ResultBlock[];
    expect(feedback[0]).toMatchObject({ is_error: true, content: expect.stringContaining("30 words in a row") });
  });

  it("Quill: keeps a summary fixed after the corrective turn", async () => {
    const { deps } = setup([
      { content: [submit(result({ role: "quill", summary: words("new", 30) }))] },
      { content: [submit(result({ role: "quill", summary: "What changed for the team after regionals?" }))] },
    ]);
    expect((await consultSpecialist(deps, await input("quill"))).summary).toBe(
      "What changed for the team after regionals?",
    );
  });

  it("Quill: quoting an essay it read isn't new prose", async () => {
    const body = words("draft", 40);
    const port = createFakePort({ essays: [{ ...first(jordanData().essays), body, wordCount: 40 }] });
    const summary = `You wrote "${body}" What happened next?`;
    const { deps, model } = setup(
      [
        { content: [call("get_essay", { essayId: JORDAN.essayId })] },
        { content: [submit(result({ role: "quill", summary }))] },
      ],
      port,
    );
    expect((await consultSpecialist(deps, await input("quill"))).summary).toBe(summary);
    expect(model.requests).toHaveLength(2);
  });

  it("Quill: checks uncertainty lines and action titles too, and clears actions on a final failure", async () => {
    const action = {
      title: "Ask Ms. Ruiz about the regionals story",
      minutes: 15,
      dueOn: null,
      valueUsd: null,
      refType: null,
      refId: null,
    };
    const bad = result({
      role: "quill",
      summary: "What changed after regionals?",
      proposedActions: [action],
      uncertainty: [words("new", 30)],
    });
    const { deps, model } = setup([{ content: [submit(bad)] }, { content: [submit(bad)] }]);
    const out = await consultSpecialist(deps, await input("quill"));
    expect(model.requests).toHaveLength(2);
    const feedback = model.requests[1]?.messages[2]?.content as ResultBlock[];
    expect(feedback[0]).toMatchObject({
      is_error: true,
      content: expect.stringContaining("an uncertainty line has 30 words in a row"),
    });
    expect(out).toMatchObject({ summary: INTEGRITY_SUMMARY, proposedActions: [], uncertainty: [] });
  });

  it("drops refs that weren't in the context or one of its tool results", async () => {
    const unknown = "00000000-0000-4000-8000-0000000000ff";
    const cited = result({
      factsUsed: [
        ...result().factsUsed,
        { claim: "Draft has 18 words", source: "record", refId: `essay:${unknown}`, verifiedAt: null },
        { claim: "Gap is $9,200", source: "calculation", refId: "calc:scout-1", verifiedAt: null },
        { claim: "Lives in Travis County", source: "profile", refId: null, verifiedAt: null },
      ],
      proposedActions: [
        {
          title: "Start the Hill Country application",
          minutes: 60,
          dueOn: "2026-10-15",
          valueUsd: 1000,
          refType: "scholarship",
          refId: JORDAN.scholarshipId,
        },
        {
          title: "Apply to a made-up award",
          minutes: 60,
          dueOn: null,
          valueUsd: null,
          refType: "scholarship",
          refId: unknown,
        },
      ],
    });
    const { deps } = setup([{ content: [call("get_matches")] }, { content: [submit(cited)] }]);
    const out = await consultSpecialist(deps, await input("scout"));
    expect(out.factsUsed.map((f) => f.refId)).toEqual([`scholarship:${JORDAN.scholarshipId}`, null]);
    expect(out.proposedActions.map((a) => a.title)).toEqual(["Start the Hill Country application"]);
  });

  it("keeps a calc ref its own tool returned", async () => {
    const cited = result({
      role: "quill",
      summary: "Your intro runs 5 words.",
      factsUsed: [{ claim: "5 words", source: "calculation", refId: "calc:quill-1", verifiedAt: null }],
    });
    const { deps } = setup([
      { content: [call("count_words", { text: "Our robot died at regionals." })] },
      { content: [submit(cited)] },
    ]);
    expect((await consultSpecialist(deps, await input("quill"))).factsUsed).toEqual(cited.factsUsed);
  });
});

describe("makeConsult", () => {
  it("binds the deps into a ConsultFn", async () => {
    const { deps, model } = setup([{ content: [submit(result())] }]);
    const consult = makeConsult(deps);
    expect(await consult(await input("scout"))).toEqual(result());
    expect(model.requests[0]?.role).toBe("scout");
  });
});
