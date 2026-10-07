import { CrewReply, type CrewRequester, type IsoDate, PlanItemInput } from "@scholarcrew/domain";
import { z } from "zod";
import { buildContextBlocks } from "../context/blocks";
import type { AgentDeps } from "../context/port";
import { FAMILY_DEFAULT_ALLOWED } from "../guards/privacy";
import { type KnownSources, planItemProblem } from "../guards/sources";
import { COMPASS_LIMITS } from "../loop/limits";
import { runCheckedAgentLoop } from "../loop/loop";
import { COMPASS_MAX_TOKENS } from "./crew";
import { COMPASS_SYSTEM } from "./prompt";
import { refusalReply } from "./replies";
import { createCompassSession } from "./session";

export const MAX_PLAN_ITEMS = 8;
/** The weekly plan is always for the student, in their own My Crew context. */
const WEEKLY_REQUESTER: CrewRequester = { role: "student", firstName: "" };

export const WeeklyPlanSubmission = z.strictObject({
  items: z.array(PlanItemInput).max(MAX_PLAN_ITEMS),
  reply: CrewReply,
});
export type WeeklyPlanSubmission = z.infer<typeof WeeklyPlanSubmission>;

export const SUBMIT_PLAN_DESCRIPTION =
  "Submit this week's plan: up to 8 items in priority order and a short reply that explains it.";

export function weeklyPlanRequest(weekStart: IsoDate): string {
  return [
    `Plan my week starting ${weekStart}.`,
    "Pick up to 8 items, most important first, that move my scholarships, essays, applications, aid, and other goals forward.",
    "Use real deadlines, minutes, and dollar values from my data or the specialists. Set refType and refId when an item is about a specific scholarship, college, essay, or story.",
    "Then call submit_plan with the items and a short reply that explains the plan.",
  ].join(" ");
}

/** Pins items to the week, drops duplicates by title and items with unknown refs, and keeps at most 8. */
export function clampPlanItems(items: PlanItemInput[], weekStart: IsoDate, known: KnownSources): PlanItemInput[] {
  const seen = new Set<string>();
  const out: PlanItemInput[] = [];
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key) || planItemProblem(item, known)) continue;
    seen.add(key);
    out.push({ ...item, title: item.title.trim(), weekStart });
    if (out.length === MAX_PLAN_ITEMS) break;
  }
  return out;
}

export async function runWeeklyPlan(
  deps: AgentDeps,
  i: { ownerId: string; weekStart: IsoDate },
): Promise<{ items: PlanItemInput[]; reply: CrewReply | null }> {
  const snapshot = await deps.port.snapshot(i.ownerId, "my_crew", "crew");
  const session = createCompassSession(deps, {
    ownerId: i.ownerId,
    audience: "crew",
    snapshot,
    allowed: FAMILY_DEFAULT_ALLOWED,
    submitName: "submit_plan",
  });
  await session.progress("compass", "Compass is planning your week.");

  const result = await runCheckedAgentLoop(deps.model, {
    role: "compass",
    system: COMPASS_SYSTEM,
    userContent: buildContextBlocks(snapshot, [], weeklyPlanRequest(i.weekStart), [], WEEKLY_REQUESTER),
    tools: session.tools,
    submit: { name: "submit_plan", description: SUBMIT_PLAN_DESCRIPTION, schema: WeeklyPlanSubmission },
    effort: "medium",
    maxTokens: COMPASS_MAX_TOKENS,
    limits: COMPASS_LIMITS,
    onTurn: session.onTurn,
    now: () => deps.now().getTime(),
    check: (plan) => [
      ...session.check(plan.reply),
      ...plan.items.map((item) => planItemProblem(item, session.known)).filter((p): p is string => p !== null),
    ],
  });
  await session.flush();

  if (result.reason === "refused") return { items: [], reply: refusalReply(session.contributors()) };
  if (result.reason !== "submitted" || !result.output) return { items: [], reply: null };
  return {
    items: clampPlanItems(result.output.items, i.weekStart, session.known),
    reply: session.finish(result.output.reply),
  };
}
