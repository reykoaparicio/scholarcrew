import { usd } from "@/lib/format";
import type { ApplicationPatch, ApplicationStage, Board, BoardCard, ScholarshipApplication } from "@scholarcrew/domain";

export type BoardFilter = "all" | "local" | "national" | "renewable" | "reuse";
export const BOARD_FILTERS: Array<{ key: BoardFilter; label: string }> = [
  { key: "all", label: "Matched to you" },
  { key: "local", label: "Local" },
  { key: "national", label: "National" },
  { key: "renewable", label: "Renewable" },
  { key: "reuse", label: "Reuses my essays" },
];

export type ColumnKey = "matched" | "working" | "submitted" | "won" | "lostOrSkipped";
export const COLUMN_TITLES: Record<ColumnKey, string> = {
  matched: "Matched",
  working: "Working on",
  submitted: "Submitted",
  won: "Won",
  lostOrSkipped: "Lost and skipped",
};

export function matchesFilter(c: BoardCard, filter: BoardFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "local":
      return c.scholarship.localLabel !== "National";
    case "national":
      return c.scholarship.localLabel === "National";
    case "renewable":
      return c.scholarship.renewable;
    case "reuse":
      return c.reuseStoryTitle !== null;
  }
}

/** SC-03: Matched, Working on, Submitted, Won; Lost and skipped only when the filter is on. Card order is the core's (07 ranks Matched by value per hour, R2P-5); filters never re-sort. */
export function boardColumns(
  b: Board,
  filter: BoardFilter,
  showClosed: boolean,
): Array<{ key: ColumnKey; title: string; cards: BoardCard[] }> {
  const keys: ColumnKey[] = ["matched", "working", "submitted", "won"];
  if (showClosed) keys.push("lostOrSkipped");
  return keys.map((key) => ({ key, title: COLUMN_TITLES[key], cards: b[key].filter((c) => matchesFilter(c, filter)) }));
}

export function columnFor(stage: ApplicationStage): ColumnKey {
  switch (stage) {
    case "matched":
      return "matched";
    case "planned":
    case "drafting":
      return "working";
    case "submitted":
      return "submitted";
    case "won":
      return "won";
    case "lost":
    case "skipped":
      return "lostOrSkipped";
  }
}

/** A null patch means "open the won dialog" (SC-09 needs the amount and renewability). */
export interface CardAction {
  key: string;
  label: string;
  patch: ApplicationPatch | null;
}

const SKIP: CardAction = { key: "skip", label: "Skip", patch: { stage: "skipped" } };

export function cardActions(app: Pick<ScholarshipApplication, "stage" | "thankYouSent">): CardAction[] {
  switch (app.stage) {
    case "matched":
      return [{ key: "save", label: "Save", patch: { stage: "planned" } }, SKIP];
    case "planned":
      return [{ key: "draft", label: "Start drafting", patch: { stage: "drafting" } }, SKIP];
    case "drafting":
      return [{ key: "submit", label: "Mark submitted", patch: { stage: "submitted" } }];
    case "submitted":
      return [
        { key: "won", label: "Mark won", patch: null },
        { key: "lost", label: "Didn't win", patch: { stage: "lost" } },
      ];
    case "won":
      return app.thankYouSent ? [] : [{ key: "thanks", label: "Thank-you note sent", patch: { thankYouSent: true } }];
    case "lost":
    case "skipped":
      return [{ key: "restore", label: "Move back to matched", patch: { stage: "matched" } }];
  }
}

/**
 * R3V-1: 07 stores a student's own local submission with amounts 0 until an admin publishes it. A draft is the only
 * kind of listing a student sees unpublished, so its amount reads as unknown instead of "$0". A published $0 stays "$0".
 */
export const UNKNOWN_AMOUNT = "Amount not known yet";

/** The card's headline amount: the won amount, else the listing's top amount, else unknown for a draft. */
export function cardAmount(c: Pick<BoardCard, "scholarship" | "application">): string {
  const { scholarship: s, application: a } = c;
  if (a.stage === "won" && a.outcomeUsd !== null) return usd(a.outcomeUsd);
  return s.status === "draft" ? UNKNOWN_AMOUNT : usd(s.amountMaxUsd);
}

export function totalsLine(t: Board["totals"]): string {
  return `${usd(t.inPlayUsd)} in play · ${usd(t.wonUsd)} won · ${t.dueThisMonth} due this month · Scout looks for new matches every Sunday`;
}

export type WonChoice = "one_time" | "renewable";
export type WonInput = { ok: true; patch: ApplicationPatch } | { ok: false; error: string };

/** SC-09: whole dollars (commas and $ allowed) plus one-time or renewable. */
export function parseWonInput(amountText: string, renewable: WonChoice | null): WonInput {
  const cleaned = amountText.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: "Enter the amount you won in whole dollars." };
  const amount = Number(cleaned);
  if (amount < 1 || amount > 10_000_000) return { ok: false, error: "Enter an amount between $1 and $10,000,000." };
  if (!renewable) return { ok: false, error: "Pick one-time or renewable." };
  return { ok: true, patch: { stage: "won", outcomeUsd: amount, outcomeRenewable: renewable === "renewable" } };
}
