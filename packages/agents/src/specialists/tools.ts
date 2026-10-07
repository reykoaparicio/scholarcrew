import {
  AppError,
  COMPOSITE_RANGE,
  type College,
  Id,
  IsoDate,
  SENSITIVE_RULE_TYPES,
  type SpecialistRole,
  USState,
  Usd,
} from "@scholarcrew/domain";
import { countChars, countWords, retakeAnalysis } from "@scholarcrew/engines";
import { z } from "zod";
import { createCalculatorTools } from "../calculators";
import type { CrewDataPort } from "../context";
import type { ToolDef } from "../model/types";
import { type Audience, calcRegistry } from "./shared";

export const DATA_TOOL_NAMES = [
  "get_matches",
  "search_scholarships",
  "get_scholarship",
  "get_deadlines",
  "get_college_list",
  "get_college",
  "get_application_items",
  "get_test_scores",
  "list_stories",
  "get_story",
  "get_essay",
  "count_words",
  "get_aid_checklist",
  "get_offers",
  "get_costs",
  "retake_value",
  "get_activities",
  "get_service_progress",
  "count_chars",
] as const;
export type DataToolName = (typeof DATA_TOOL_NAMES)[number];

/** AG-02: each specialist's data scope. */
export const ROLE_TOOLS: Record<SpecialistRole, DataToolName[]> = {
  scout: ["get_matches", "search_scholarships", "get_scholarship", "get_deadlines"],
  atlas: ["get_college_list", "get_college", "get_application_items", "get_deadlines", "get_test_scores"],
  quill: ["list_stories", "get_story", "get_essay", "count_words"],
  aid: ["get_aid_checklist", "get_offers", "get_costs", "get_college"],
  ledger: ["get_costs", "get_offers"],
  prep: ["get_test_scores", "get_college_list", "get_college", "retake_value"],
  impact: ["get_activities", "get_service_progress", "count_chars"],
};

/** Essays, stories, and test scores never reach family runs: essays and stories aren't shared by default, and test scores have no share category. */
export const FAMILY_HIDDEN_TOOLS: DataToolName[] = [
  "list_stories",
  "get_story",
  "get_essay",
  "get_test_scores",
  "retake_value",
];
/** Must never include days_until: the Ledger calculators get dummy now/timeZone values (see specialistTools). */
export const LEDGER_CALCULATOR_NAMES: readonly string[] = [
  "ledger_gap",
  "ledger_compare_offers",
  "ledger_loan_payment",
];
export const ACTIVITY_CHAR_LIMIT = 150;

const NoInput = z.strictObject({});
const SearchInput = z.strictObject({
  q: z.string().max(100),
  state: USState.nullable(),
  renewable: z.boolean().nullable(),
  minUsd: Usd.nullable(),
  deadlineBefore: IsoDate.nullable(),
});
const ScholarshipInput = z.strictObject({ idOrSlug: z.string().min(1).max(200) });
const CollegeInput = z.strictObject({ collegeId: z.string().min(1).max(12) });
const GetEssayInput = z.strictObject({ essayId: Id });
const TextInput = z.strictObject({ text: z.string().max(50_000) });
const RetakeInput = z.strictObject({
  test: z.enum(["ACT", "SAT"]),
  targetComposite: z.number().int().min(1).max(1600),
});

function tool<I>(name: string, description: string, input: z.ZodType<I>, run: (i: I) => Promise<unknown>): ToolDef {
  const def: ToolDef<I> = { name, description, input, run };
  return def;
}

function found<T>(value: T | null, message: string): T {
  if (value === null) throw new AppError("not_found", message);
  return value;
}

export function createDataTools(
  port: CrewDataPort,
  ownerId: string,
  audience: Audience,
  register: (toolName: string) => string,
): Record<DataToolName, ToolDef> {
  return {
    get_matches: tool(
      "get_matches",
      "Ranked scholarship matches for this student. privateMatches counts matches that use details the student keeps private. They are on the student board. Never guess what they are.",
      NoInput,
      async () => {
        const result = await port.matches(ownerId, audience);
        const matches = result.matches.filter((match) => !match.reasons.some((reason) => reason.sensitive));
        return { matches, privateMatches: result.privateCount + result.matches.length - matches.length };
      },
    ),
    search_scholarships: tool(
      "search_scholarships",
      "Search the published scholarship catalog by name or keyword. Use an empty q to browse. Null filters are ignored. Returns at most 10 listings.",
      SearchInput,
      async (i) => {
        const results = await port.searchScholarships({
          q: i.q.trim() || undefined,
          state: i.state ?? undefined,
          renewable: i.renewable ?? undefined,
          minUsd: i.minUsd ?? undefined,
          deadlineBefore: i.deadlineBefore ?? undefined,
          page: 1,
          pageSize: 10,
        });
        return results.slice(0, 10);
      },
    ),
    get_scholarship: tool(
      "get_scholarship",
      "One catalog scholarship by id or slug: amount, deadline, eligibility rules, requirements, sourceUrl, verifiedAt, and whether it's stale.",
      ScholarshipInput,
      async (i) => {
        const scholarship = found(await port.scholarship(i.idOrSlug), "No scholarship with that id or slug.");
        return {
          ...scholarship,
          eligibility: scholarship.eligibility.filter(
            (rule) => !(SENSITIVE_RULE_TYPES as readonly string[]).includes(rule.type),
          ),
        };
      },
    ),
    get_deadlines: tool(
      "get_deadlines",
      "This student's upcoming deadlines (scholarships, applications, aid, essays) with days left.",
      NoInput,
      () => port.deadlines(ownerId),
    ),
    get_college_list: tool(
      "get_college_list",
      "The student's college list: fit, plan (ED/EA/REA/RD/rolling), status, deadline, checklist progress, gap, outside-scholarship policy, and test policy.",
      NoInput,
      () => port.collegeList(ownerId),
    ),
    get_college: tool(
      "get_college",
      "One college's catalog record by IPEDS id: cost, overall net price, test policy, merit tiers, deadlines, requirements, aid priority date, sourceUrl, verifiedAt.",
      CollegeInput,
      async (i) => {
        const college = found(await port.college(i.collegeId), "No college with that id.");
        const { netPriceByIncome, ...publicCollege } = college;
        return { ...publicCollege, netPriceUsd: netPriceByIncome.overall };
      },
    ),
    get_application_items: tool(
      "get_application_items",
      "Checklist items for every application on the list: kind, label, status, and due date.",
      NoInput,
      () => port.applicationItems(ownerId),
    ),
    get_test_scores: tool(
      "get_test_scores",
      "The student's ACT, SAT, and PSAT scores with dates, sections, and whether each is official.",
      NoInput,
      () => port.testScores(ownerId),
    ),
    list_stories: tool(
      "list_stories",
      "Up to 30 Story Bank summaries: id, title, themes, summary and usesCount. Use get_story for one full story.",
      NoInput,
      async () =>
        (await port.stories(ownerId))
          .filter((s) => s.archivedAt === null)
          .slice(0, 30)
          .map(({ id, title, moment, themes, summary, uses }) => ({
            id,
            title,
            themes,
            summary: (summary || moment).slice(0, 300),
            usesCount: uses.length,
          })),
    ),
    get_story: tool(
      "get_story",
      "One full student-owned, active story by id.",
      z.strictObject({ id: Id }),
      async ({ id }) => found(await port.story(ownerId, id), "No story with that id."),
    ),
    get_essay: tool(
      "get_essay",
      "One essay by id: title, prompt, word and character limits, target, status, the current draft, and its word count.",
      GetEssayInput,
      async (i) => {
        const e = found(await port.essay(ownerId, i.essayId), "No essay with that id.");
        return {
          id: e.id,
          title: e.title,
          prompt: e.prompt,
          wordLimit: e.wordLimit,
          charLimit: e.charLimit,
          targetLabel: e.targetLabel,
          status: e.status,
          body: e.body,
          wordCount: e.wordCount,
          openComments: e.comments.filter((c) => c.resolvedAt === null).length,
        };
      },
    ),
    count_words: tool(
      "count_words",
      "Count words and characters in a piece of text, for essay and form limits. Cite the returned calcId.",
      TextInput,
      async (i) => ({ calcId: register("count_words"), words: countWords(i.text), chars: countChars(i.text) }),
    ),
    get_aid_checklist: tool(
      "get_aid_checklist",
      "FAFSA and CSS Profile checklists for the current award year: each step, who does it (student or parent), status, and due date.",
      NoInput,
      () => port.aidChecklist(ownerId),
    ),
    get_offers: tool(
      "get_offers",
      "Ledger's comparison of the student's confirmed award letters: free money, work-study, loans, what the letter says you owe, what it really costs, and the four-year total.",
      NoInput,
      () => port.offers(ownerId),
    ),
    get_costs: tool(
      "get_costs",
      "Cost of attendance, free money, gap, pending scholarships, and budget per listed college, with the source of each estimate.",
      NoInput,
      () => port.costs(ownerId),
    ),
    retake_value: tool(
      "retake_value",
      "Computes which listed colleges' merit tiers a target ACT or SAT composite would unlock and the dollar difference per year and over four years. Cite the returned calcId.",
      RetakeInput,
      async (i) => {
        const range = COMPOSITE_RANGE[i.test];
        if (i.targetComposite < range.min || i.targetComposite > range.max) {
          throw new AppError("invalid_input", `${i.test} composites run ${range.min} to ${range.max}.`);
        }
        const [entries, scores, snapshot] = await Promise.all([
          port.collegeList(ownerId),
          port.testScores(ownerId),
          port.snapshot(ownerId, "my_crew", audience),
        ]);
        const colleges = (await Promise.all(entries.map((e) => port.college(e.collegeId)))).filter(
          (c): c is College => c !== null,
        );
        const best = (test: "ACT" | "SAT"): number | null => {
          const values = scores.filter((s) => s.official && s.test === test).map((s) => s.composite);
          return values.length > 0 ? Math.max(...values) : null;
        };
        const analysis = retakeAnalysis({
          colleges,
          gpa: snapshot.profile.gpa,
          currentAct: best("ACT"),
          currentSat: best("SAT"),
          target: { test: i.test, composite: i.targetComposite },
        });
        return { calcId: register("retake_value"), ...analysis };
      },
    ),
    get_activities: tool(
      "get_activities",
      "The student's activities list (up to 10): role, organization, description, hours per week, weeks per year, grades.",
      NoInput,
      () => port.activities(ownerId),
    ),
    get_service_progress: tool(
      "get_service_progress",
      "Service-hour requirements per scholarship: hours required, total logged, and verified.",
      NoInput,
      () => port.serviceProgress(ownerId),
    ),
    count_chars: tool(
      "count_chars",
      "Count characters exactly (Unicode code points) against the 150-character activity description limit. Cite the returned calcId.",
      TextInput,
      async (i) => {
        const chars = countChars(i.text);
        return {
          calcId: register("count_chars"),
          chars,
          limit: ACTIVITY_CHAR_LIMIT,
          over: chars > ACTIVITY_CHAR_LIMIT,
          remaining: ACTIVITY_CHAR_LIMIT - chars,
        };
      },
    ),
  };
}

/** The tools one specialist gets for one run. Fresh calc numbering per run. */
export function specialistTools(
  role: SpecialistRole,
  port: CrewDataPort,
  ownerId: string,
  audience: Audience,
): ToolDef[] {
  const register = calcRegistry(role);
  const all = createDataTools(port, ownerId, audience, register);
  const tools = ROLE_TOOLS[role]
    .filter((name) => audience === "crew" || !FAMILY_HIDDEN_TOOLS.includes(name))
    .map((name) => all[name]);
  if (role !== "ledger") return tools;
  // The three Ledger calculators never read now/timeZone, so these are dummy values. Only days_until reads them,
  // and the explicit LEDGER_CALCULATOR_NAMES allow-list keeps it out. Don't add days_until to that list.
  const ledger = createCalculatorTools({ now: () => new Date(0), timeZone: "UTC", register }).filter((t) =>
    LEDGER_CALCULATOR_NAMES.includes(t.name),
  );
  return [...tools, ...ledger];
}
