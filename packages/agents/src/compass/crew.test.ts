import type {
  CrewReply,
  CrewRequestInput,
  ProgressEvent,
  ReceiptItem,
  SpecialistResult,
  SpecialistRole,
} from "@scholarcrew/domain";
import { describe, expect, it, vi } from "vitest";
import type { AgentDeps, ConsultFn, CrewDataPort } from "../context/port";
import { CRISIS_REPLY } from "../guards/crisis";
import { JORDAN, createFakePort } from "../testing/fakePort";
import { type ScriptedTurn, createScriptedModelClient } from "../testing/scripted";
import { QUILL_FEEDBACK_ONLY_TEXT, runCrewRequest } from "./crew";
import { COMPASS_SYSTEM } from "./prompt";
import { OUT_OF_TIME_TEXT, REFUSAL_TEXT } from "./replies";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const S1 = JORDAN.scholarshipId;

function specialist(role: SpecialistRole, factsUsed: SpecialistResult["factsUsed"] = []): SpecialistResult {
  return { role, summary: `${role} summary`, proposedActions: [], factsUsed, uncertainty: [], needsPermission: [] };
}

function setup(o: {
  script: ScriptedTurn[] | (() => ScriptedTurn);
  consult?: ConsultFn;
  port?: CrewDataPort & { calls: string[] };
}) {
  const model = createScriptedModelClient(o.script);
  const port = o.port ?? createFakePort();
  const progress: ProgressEvent[] = [];
  const usage: string[] = [];
  const fallback: ConsultFn = async ({ role }) => specialist(role);
  const consult = vi.fn(o.consult ?? fallback);
  const deps: AgentDeps = {
    model,
    port,
    consult,
    now: () => NOW,
    onProgress: async (e) => {
      progress.push(e);
    },
    onUsage: async (role) => {
      usage.push(role);
    },
  };
  return { model, port, consult, deps, progress, usage };
}

const request = (o: Partial<CrewRequestInput> = {}): CrewRequestInput => ({
  jobId: "99999999-9999-4999-8999-999999999999",
  ownerId: JORDAN.ownerId,
  conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  room: "my_crew",
  roomRef: null,
  audience: "crew",
  requester: { role: "student", firstName: "Jordan" },
  userText: "What should I do this weekend?",
  history: [],
  mentions: [],
  ...o,
});

const reply = (o: Partial<CrewReply> = {}): CrewReply => ({
  text: "Outline the Hill Country STEM essay this weekend.",
  contributors: ["compass"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
  ...o,
});

const factItem: ReceiptItem = {
  kind: "fact",
  label: "You live in Travis County",
  refId: `fact:${JORDAN.factId}`,
  sourceUrl: null,
  verifiedAt: null,
};
const deadlineItem: ReceiptItem = {
  kind: "record",
  label: "Hill Country deadline",
  refId: `scholarship:${S1}`,
  sourceUrl: null,
  verifiedAt: null,
};
const badFact: ReceiptItem = { ...factItem, label: "Made up", refId: "fact:00000000-0000-4000-8000-000000000000" };
const catalogItem: ReceiptItem = {
  kind: "catalog",
  label: "Hill Country STEM Award listing",
  refId: `scholarship:${S1}`,
  sourceUrl: JORDAN.scholarshipSourceUrl,
  verifiedAt: JORDAN.scholarshipVerifiedAt,
};

const submitReply = (r: CrewReply) => ({ type: "tool_use" as const, name: "submit_reply", input: r });
const consultCall = (role: string, question = "What's due soon?") => ({
  type: "tool_use" as const,
  name: `consult_${role}`,
  input: { question },
});

type ResultBlock = { tool_use_id: string; content: string; is_error?: boolean };
const resultsOf = (model: ReturnType<typeof createScriptedModelClient>, request: number) =>
  model.requests[request]?.messages[2]?.content as ResultBlock[];

describe("runCrewRequest", () => {
  it("honors a model crisis handoff and discards its text and cards", async () => {
    const s = setup({ script: [{ content: [submitReply(reply({ text: "model text", safety: "crisis" }))] }] });
    const result = await runCrewRequest(s.deps, request());
    expect(result).toEqual({ reply: CRISIS_REPLY, status: "ready", safety: "crisis", consulted: [] });
    expect(result.reply?.actionCards).toEqual([]);
  });

  it("retries ghostwritten Compass prose in an essay room and then substitutes coaching", async () => {
    const prose = Array.from({ length: 40 }, (_, i) => `novel${i}`).join(" ");
    const s = setup({
      script: [{ content: [submitReply(reply({ text: prose }))] }, { content: [submitReply(reply({ text: prose }))] }],
    });
    const result = await runCrewRequest(
      s.deps,
      request({ room: "essay", roomRef: { type: "essay", id: JORDAN.essayId } }),
    );
    expect(s.model.requests).toHaveLength(2);
    expect(result.reply?.text).toBe(QUILL_FEEDBACK_ONLY_TEXT);
    expect(result.reply?.safety).toBe("partial");
  });

  it("answers a crisis message with 988 info and no model call", async () => {
    const { deps, model, port, consult } = setup({ script: [] });
    const result = await runCrewRequest(deps, request({ userText: "I want to die. I can't do this anymore." }));
    expect(result).toEqual({ reply: CRISIS_REPLY, status: "ready", safety: "crisis", consulted: [] });
    expect(model.requests).toHaveLength(0);
    expect(port.calls).toEqual([]);
    expect(consult).not.toHaveBeenCalled();
  });

  it("consults a specialist and returns a guarded reply with real contributors", async () => {
    const scoutFacts = [
      {
        claim: "Deadline Oct 15",
        source: "catalog" as const,
        refId: `scholarship:${S1}`,
        verifiedAt: JORDAN.scholarshipVerifiedAt,
      },
    ];
    const { deps, model, consult, progress, usage } = setup({
      consult: async ({ role }) => specialist(role, scoutFacts),
      script: [
        { content: [consultCall("scout")] },
        {
          content: [
            submitReply(
              reply({
                contributors: ["compass", "scout", "atlas"],
                receipt: [catalogItem, factItem, deadlineItem],
                actionCards: [
                  {
                    kind: "add_plan_item",
                    id: "outline",
                    label: "Add to my weekend",
                    item: {
                      title: "Outline the essay",
                      kind: "scholarship",
                      refType: "scholarship",
                      refId: S1,
                      minutes: 30,
                      valueUsd: 1000,
                      dueOn: "2026-10-15",
                      contributors: ["scout"],
                      weekStart: null,
                    },
                  },
                ],
              }),
            ),
          ],
        },
      ],
    });
    const result = await runCrewRequest(deps, request());
    expect(result.status).toBe("ready");
    expect(result.safety).toBeNull();
    expect(result.consulted).toEqual(["scout"]);
    expect(result.reply.contributors).toEqual(["compass", "scout"]);
    expect(result.reply.receipt).toHaveLength(3);
    expect(result.reply.actionCards).toHaveLength(1);
    expect(consult).toHaveBeenCalledWith(
      expect.objectContaining({ role: "scout", question: "What's due soon?", audience: "crew" }),
    );
    const toolResult = JSON.parse(resultsOf(model, 1)[0]?.content ?? "{}") as { catalogSources: unknown };
    expect(toolResult.catalogSources).toEqual([
      { refId: `scholarship:${S1}`, sourceUrl: JORDAN.scholarshipSourceUrl, verifiedAt: JORDAN.scholarshipVerifiedAt },
    ]);
    expect(progress.map((p) => p.text)).toEqual(["Compass is reading your request.", "Asking Scout…"]);
    expect(progress[0]?.at).toBe(NOW.toISOString());
    expect(usage).toEqual(["compass", "compass"]);
  });

  it("sends the cached prompt, wrapped context, strict tools, and medium effort", async () => {
    const { deps, model } = setup({ script: [{ content: [submitReply(reply())] }] });
    await runCrewRequest(deps, request({ userText: "@Scout what's due?", mentions: ["scout"] }));
    const req = model.requests[0];
    expect(req).toMatchObject({ role: "compass", system: COMPASS_SYSTEM, effort: "medium", maxTokens: 16_000 });
    expect(req?.tools.map((t) => t.name).slice(-6)).toEqual([
      "ledger_gap",
      "ledger_compare_offers",
      "ledger_loan_payment",
      "count_words",
      "days_until",
      "submit_reply",
    ]);
    const blocks = req?.messages[0]?.content as Array<{ type: string; text: string }>;
    expect(blocks[0]?.text).toContain('<untrusted label="student_context">');
    expect(blocks.at(-1)?.text).toBe("@Scout what's due?\n\nThe student mentioned @Scout.");
  });

  it("caps consultations at four per request", async () => {
    const { deps, model, consult } = setup({
      script: [
        { content: ["scout", "atlas", "quill", "aid", "ledger"].map((r) => consultCall(r)) },
        { content: [submitReply(reply())] },
      ],
    });
    const result = await runCrewRequest(deps, request());
    expect(consult).toHaveBeenCalledTimes(4);
    const results = resultsOf(model, 1);
    expect(results).toHaveLength(5);
    expect(results[4]).toMatchObject({ is_error: true, content: expect.stringContaining("Call submit_reply now") });
    expect(result.consulted).toEqual(["scout", "atlas", "quill", "aid"]);
    expect(result.reply.contributors).toEqual(["compass", "scout", "atlas", "quill", "aid"]);
  });

  it("asks once to fix a reply that cites unknown sources, without editing history", async () => {
    const { deps, model } = setup({
      script: [
        { content: [submitReply(reply({ receipt: [badFact] }))] },
        { content: [submitReply(reply({ receipt: [factItem] }))] },
      ],
    });
    const result = await runCrewRequest(deps, request());
    expect(result).toMatchObject({ status: "ready", safety: null });
    expect(result.reply.receipt).toEqual([factItem]);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1]?.messages[0]).toEqual(model.requests[0]?.messages[0]);
    expect(resultsOf(model, 1)[0]).toMatchObject({ is_error: true, content: expect.stringContaining("unknown fact") });
  });

  it("drops what still fails after the retry and marks the reply partial", async () => {
    const bad = reply({ receipt: [badFact, deadlineItem] });
    const { deps } = setup({ script: [{ content: [submitReply(bad)] }, { content: [submitReply(bad)] }] });
    const result = await runCrewRequest(deps, request());
    expect(result).toMatchObject({ status: "ready", safety: "partial" });
    expect(result.reply.receipt).toEqual([deadlineItem]);
    expect(result.reply.safety).toBe("partial");
  });

  it("keeps essays out of family replies", async () => {
    const essayItem: ReceiptItem = {
      kind: "record",
      label: "Your STEM essay draft",
      refId: `essay:${JORDAN.essayId}`,
      sourceUrl: null,
      verifiedAt: null,
    };
    const withEssay = reply({ receipt: [essayItem, deadlineItem] });
    const { deps, model, port, consult } = setup({
      consult: async ({ role }) =>
        specialist(role, [
          { claim: "Draft has 18 words", source: "record", refId: `essay:${JORDAN.essayId}`, verifiedAt: null },
        ]),
      script: [
        { content: [consultCall("quill")] },
        { content: [submitReply(withEssay)] },
        { content: [submitReply(withEssay)] },
      ],
    });
    const result = await runCrewRequest(deps, request({ room: "family", audience: "family" }));
    expect(port.calls[0]).toBe("snapshot:family:family");
    expect(consult).toHaveBeenCalledWith(expect.objectContaining({ audience: "family" }));
    expect(model.requests[2]?.messages[4]?.content).toEqual([
      expect.objectContaining({ is_error: true, content: expect.stringContaining("isn't shared with family") }),
    ]);
    expect(result.reply.receipt).toEqual([deadlineItem]);
    expect(result.safety).toBe("partial");
  });

  it("turns a refusal into a polite reply", async () => {
    const { deps } = setup({ script: [{ stopReason: "refusal" }] });
    const result = await runCrewRequest(deps, request());
    expect(result).toMatchObject({ status: "ready", safety: "refusal", consulted: [] });
    expect(result.reply).toMatchObject({
      text: REFUSAL_TEXT,
      contributors: ["compass"],
      safety: "refusal",
      needsInput: false,
    });
  });

  it("recovers from one invalid submit_reply and fails safely after two (R3E-3)", async () => {
    const invalid = { type: "tool_use" as const, name: "submit_reply", input: { ...reply(), safety: "fine" } };
    const once = setup({ script: [{ content: [invalid] }, { content: [submitReply(reply())] }] });
    expect(await runCrewRequest(once.deps, request())).toMatchObject({ status: "ready", safety: null });
    expect(resultsOf(once.model, 1)[0]).toMatchObject({ is_error: true, content: expect.stringContaining("safety: ") });
    expect(once.model.requests[0]?.tools.at(-1)).toMatchObject({ name: "submit_reply", strict: false });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const twice = setup({ script: [{ content: [invalid] }, { content: [invalid] }] });
    const result = await runCrewRequest(twice.deps, request());
    expect(twice.model.requests).toHaveLength(2);
    expect(result).toMatchObject({ status: "failed", safety: "partial", consulted: [] });
    expect(result.reply).toMatchObject({
      text: OUT_OF_TIME_TEXT,
      contributors: ["compass"],
      safety: "partial",
      needsInput: true,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"msg":"crew.invalid_submit"'));
    log.mockRestore();
  });

  it("ends with a needs-input reply when it runs out of rounds", async () => {
    const { deps, model } = setup({
      script: () => ({ content: [{ type: "tool_use", name: "count_words", input: { text: "one two" } }] }),
    });
    const result = await runCrewRequest(deps, request());
    expect(model.requests).toHaveLength(4);
    expect(result).toMatchObject({ status: "needs_input", safety: "partial" });
    expect(result.reply).toMatchObject({ text: OUT_OF_TIME_TEXT, needsInput: true, safety: "partial" });
  });

  it("uses the model's last text when it never submits", async () => {
    const { deps } = setup({
      script: [
        { content: [{ type: "text", text: "Start the outline." }] },
        { content: [{ type: "text", text: "Start the outline tonight." }] },
      ],
    });
    const result = await runCrewRequest(deps, request());
    expect(result.status).toBe("needs_input");
    expect(result.reply.text).toBe("Start the outline tonight.");
  });

  it("falls back to the out-of-time text when the last text is too short or fails the integrity check", async () => {
    const short = setup({
      script: [
        { content: [{ type: "text", text: "Searching..." }] },
        { content: [{ type: "text", text: "Searching..." }] },
      ],
    });
    expect((await runCrewRequest(short.deps, request())).reply.text).toBe(OUT_OF_TIME_TEXT);
    const prose =
      "When I first stepped into the robotics lab I felt the hum of machines and knew that building things with my own hands would shape every choice I made about college and my future career.";
    const ghost = setup({
      script: [{ content: [{ type: "text", text: prose }] }, { content: [{ type: "text", text: prose }] }],
    });
    const result = await runCrewRequest(ghost.deps, request({ userText: "Write my essay intro." }));
    expect(result).toMatchObject({ status: "needs_input", safety: "partial" });
    expect(result.reply.text).toBe(OUT_OF_TIME_TEXT);
  });

  it("copies the request's room ref into the snapshot", async () => {
    const { deps, model } = setup({ script: [{ content: [submitReply(reply())] }] });
    await runCrewRequest(deps, request({ room: "scholarship", roomRef: { type: "scholarship", id: S1 } }));
    const blocks = model.requests[0]?.messages[0]?.content as Array<{ text: string }>;
    expect(blocks[0]?.text).toContain(`"roomRef":{"type":"scholarship","id":"${S1}"}`);
  });

  it("passes a parent requester and speaker labels into the context (D42)", async () => {
    const { deps, model } = setup({ script: [{ content: [submitReply(reply())] }] });
    await runCrewRequest(
      deps,
      request({
        room: "family",
        audience: "family",
        requester: { role: "parent", firstName: "Maria" },
        userText: "How are things going?",
        history: [{ author: "user", speaker: "student", text: "I sent the FAFSA." }],
      }),
    );
    const blocks = model.requests[0]?.messages[0]?.content as Array<{ text: string }>;
    expect(blocks[1]?.text).toContain('"speaker":"student","text":"I sent the FAFSA."');
    expect(blocks.at(-1)?.text).toBe("Maria (parent) asks: How are things going?");
  });

  it("drops fact and decision cards in a temporary room (D22)", async () => {
    const cards: CrewReply["actionCards"] = [
      {
        kind: "confirm_fact",
        id: "county",
        label: "Save my county",
        fact: { key: "county", value: "Travis", visibility: "crew", source: "user_stated", sourceRef: null },
      },
      {
        kind: "record_decision",
        id: "ed",
        label: "Record this",
        decision: { summary: "Apply early to UT", rationale: "" },
      },
      { kind: "open_link", id: "board", label: "Open my board", href: "/scholarships" },
    ];
    const temp = setup({ script: [{ content: [submitReply(reply({ actionCards: cards }))] }] });
    const result = await runCrewRequest(temp.deps, request({ room: "temporary" }));
    expect(result.reply.actionCards.map((c) => c.kind)).toEqual(["open_link"]);
    expect(result.safety).toBeNull();
    const mine = setup({ script: [{ content: [submitReply(reply({ actionCards: cards }))] }] });
    expect((await runCrewRequest(mine.deps, request())).reply.actionCards).toHaveLength(3);
  });
});
