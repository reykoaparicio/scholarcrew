import { type AgentDeps, runCrewRequest } from "@scholarcrew/agents";
import { makeConsult, runEssayReview } from "@scholarcrew/agents/specialists";
import { type FakePortData, JORDAN, createFakePort, jordanData } from "@scholarcrew/agents/testing";
import {
  ContextSnapshot,
  CostSummary,
  CrewRequestInput,
  type CrewRequester,
  type CrewRunResult,
  EssayWithBody,
  Match,
  OfferComparison,
  type QuillCommentDraft,
  type RoomKind,
  parseMentions,
} from "@scholarcrew/domain";
import { countWords } from "@scholarcrew/engines";
import type { z } from "zod";
import type { EvalContext } from "./types";

export { JORDAN };

/** jordanData's "today" (2026-10-06), so deadlines in the fixtures stay in the future. */
export const EVAL_NOW = new Date("2026-10-06T15:00:00.000Z");
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const CONVERSATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01";

/** Fresh sample data for every call; overrides replace whole fields. */
export function portData(o: Partial<FakePortData> = {}): FakePortData {
  return { ...jordanData(), ...o };
}

/** Dana is the parent in 03's seed; plan 12's loadCrewInput sends a parent's family-room request like this (D42). */
export const PARENT_REQUESTER: CrewRequester = { role: "parent", firstName: "Dana" };

/** The student as plan 12 names them: the first word of the display name, at most 60 characters. */
export function studentRequester(): CrewRequester {
  const first = jordanData().snapshot.displayName.trim().split(/\s+/)[0] ?? "";
  return { role: "student", firstName: (first || "Jordan").slice(0, 60) };
}

/**
 * Today's CrewRequestInput (D42). A family-audience case runs as the parent, everything else as the student,
 * unless the case passes its own requester. History lines carry `speaker` as plan 12 sets it.
 */
export function crewInput(o: {
  userText: string;
  room?: RoomKind;
  audience?: "crew" | "family";
  roomRef?: { type: string; id: string } | null;
  requester?: CrewRequester;
  history?: CrewRequestInput["history"];
}): CrewRequestInput {
  const audience = o.audience ?? "crew";
  return {
    jobId: JOB_ID,
    ownerId: JORDAN.ownerId,
    conversationId: CONVERSATION_ID,
    room: o.room ?? "my_crew",
    roomRef: o.roomRef ?? null,
    audience,
    requester: o.requester ?? (audience === "family" ? PARENT_REQUESTER : studentRequester()),
    userText: o.userText,
    history: o.history ?? [],
    mentions: parseMentions(o.userText),
  };
}

function issues(label: string, schema: z.ZodType, value: unknown): string[] {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => `${label} ${i.path.join(".")}: ${i.message}`);
}

export function validateInput(input: CrewRequestInput): string[] {
  return issues("input", CrewRequestInput, input);
}

/** Schema checks for the parts of the port data that cases override. */
export function validatePortData(data: FakePortData): string[] {
  return [
    ...issues("snapshot", ContextSnapshot, data.snapshot),
    ...data.essays.flatMap((e, i) => issues(`essays[${i}]`, EssayWithBody, e)),
    ...data.matches.flatMap((m, i) => issues(`matches[${i}]`, Match, m)),
    ...data.costs.flatMap((c, i) => issues(`costs[${i}]`, CostSummary, c)),
    ...issues("offers", OfferComparison, data.offers),
  ];
}

export interface CrewRun {
  result: CrewRunResult;
  port: ReturnType<typeof createFakePort>;
}

/** The worker's wiring (plan 12): base deps, then runCrewRequest with makeConsult(base). */
export async function runCrew(ctx: EvalContext, data: FakePortData, input: CrewRequestInput): Promise<CrewRun> {
  const port = createFakePort(data);
  const base: Omit<AgentDeps, "consult"> = { model: ctx.model, port, now: ctx.now };
  const result = await runCrewRequest({ ...base, consult: makeConsult(base) }, input);
  return { result, port };
}

/** Jordan's sample essay with a different saved draft. */
export function essayData(body: string): FakePortData {
  const data = jordanData();
  const essay = data.essays[0];
  if (!essay) throw new Error("jordanData has no essay");
  return { ...data, essays: [{ ...essay, body, wordCount: countWords(body), currentVersion: 1 }] };
}

export async function runReview(
  ctx: EvalContext,
  data: FakePortData,
): Promise<{ comments: QuillCommentDraft[]; refused: boolean }> {
  const port = createFakePort(data);
  const essay = data.essays.find((e) => e.id === JORDAN.essayId);
  if (!essay) throw new Error("Review fixture must include the saved essay");
  return runEssayReview(
    { model: ctx.model, port, now: ctx.now },
    {
      ownerId: JORDAN.ownerId,
      essayId: JORDAN.essayId,
      version: essay.currentVersion,
      body: essay.body,
      context: essay,
    },
  );
}

/** Every record id (and slug) in the fixture, for checking receipt refs. */
export function knownIds(data: FakePortData): Set<string> {
  const ids = new Set<string>([data.snapshot.ownerId]);
  for (const f of data.snapshot.facts) ids.add(f.id);
  for (const d of data.snapshot.decisions) ids.add(d.id);
  for (const item of data.weekPlan.items) ids.add(item.id);
  for (const s of data.scholarships) {
    ids.add(s.id);
    ids.add(s.slug);
  }
  for (const c of data.colleges) ids.add(c.id);
  for (const e of data.collegeList) ids.add(e.id);
  for (const s of data.stories) ids.add(s.id);
  for (const e of data.essays) ids.add(e.id);
  for (const t of data.testScores) ids.add(t.id);
  for (const d of data.deadlines) if (d.refId) ids.add(d.refId);
  for (const c of data.offers.columns) {
    ids.add(c.offerId);
    ids.add(c.collegeId);
  }
  return ids;
}
