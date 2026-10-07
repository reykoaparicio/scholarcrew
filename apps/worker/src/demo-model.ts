import type { ModelClient, ModelRequest } from "@scholarcrew/agents";
import { type ScriptedTurn, createScriptedModelClient } from "@scholarcrew/agents/testing";
import { calendarShort } from "@scholarcrew/core/shared";
import {
  CREW_NAMES,
  ContextSnapshot,
  type CrewReply,
  type Deadline,
  type ParsedOffer,
  type PlanItemInput,
  type QuillCommentDraft,
  type SpecialistResult,
  SpecialistRole,
} from "@scholarcrew/domain";
import type { z } from "zod";

/*
 * DEMO ONLY. A deterministic, offline stand-in for the Anthropic API, used when SCHOLARCREW_FAKE_MODEL=1
 * (local dev without an API key, and the e2e suite). It reads the same requests the real model gets and
 * answers with schema-valid submit calls built from the request's own data. It is not coaching advice and
 * must never run in production.
 */

export const NO_DEADLINES_TEXT =
  "Nothing on your list has a deadline yet. Save a scholarship or add a college and I'll keep track of the dates.";

/** Fixed sample matching the State U column of the money mockup (06_money.html). */
export const DEMO_OFFER: ParsedOffer = {
  costOfAttendanceUsd: 27_800,
  awardYear: "2027-28",
  lines: [
    {
      label: "Federal Pell Grant",
      amountUsd: 7_395,
      category: "grant",
      renewable: true,
      renewalCondition: "File the FAFSA each year",
      page: 1,
      citedText: "Federal Pell Grant $7,395",
    },
    {
      label: "State U Opportunity Grant",
      amountUsd: 8_205,
      category: "grant",
      renewable: true,
      renewalCondition: "",
      page: 1,
      citedText: "State U Opportunity Grant $8,205",
    },
    {
      label: "State U Merit Award",
      amountUsd: 3_000,
      category: "scholarship",
      renewable: true,
      renewalCondition: "Keep a 3.0 GPA",
      page: 1,
      citedText: "State U Merit Award $3,000 (renewable with a 3.0 GPA)",
    },
    {
      label: "Federal Work-Study",
      amountUsd: 2_000,
      category: "work_study",
      renewable: false,
      renewalCondition: "",
      page: 2,
      citedText: "Federal Work-Study $2,000",
    },
    {
      label: "Direct Subsidized Loan",
      amountUsd: 3_500,
      category: "loan_federal_subsidized",
      renewable: false,
      renewalCondition: "",
      page: 2,
      citedText: "Direct Subsidized Loan $3,500",
    },
    {
      label: "Direct Unsubsidized Loan",
      amountUsd: 2_000,
      category: "loan_federal_unsubsidized",
      renewable: false,
      renewalCondition: "",
      page: 2,
      citedText: "Direct Unsubsidized Loan $2,000",
    },
  ],
};

const APPEAL_TEXT = [
  "Points to raise",
  "- Ask the office to review your offer and say what changed for your family, if anything did.",
  "- Mention any lower cost at another college, using the numbers in your comparison.",
  "Documents to gather",
  "- This award letter and any competing award letters.",
  "- Your FAFSA Submission Summary.",
  "Who to contact",
  "- The college's financial aid office. Ask how they handle appeals and whether they use a form.",
  "Timeline",
  "- Reach out this week, before the enrollment deposit deadline.",
].join("\n");

const RETAKE_TEXT =
  "Here's what the retake numbers say for your list. Look at the table for each college, then confirm its merit rules on its own site before you register.";

const FILLERS: PlanItemInput[] = [
  {
    title: "Spend 20 minutes on your Story Bank",
    kind: "custom",
    refType: null,
    refId: null,
    minutes: 20,
    valueUsd: null,
    dueOn: null,
    contributors: ["compass"],
    weekStart: null,
  },
  {
    title: "Save one new scholarship to your board",
    kind: "custom",
    refType: null,
    refId: null,
    minutes: 15,
    valueUsd: null,
    dueOn: null,
    contributors: ["compass"],
    weekStart: null,
  },
];

type TextLike = { type?: unknown; text?: unknown };

function userTexts(req: ModelRequest): string[] {
  const out: string[] = [];
  for (const m of req.messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      out.push(m.content);
      continue;
    }
    for (const b of m.content as unknown as TextLike[]) {
      if (b.type === "text" && typeof b.text === "string") out.push(b.text);
    }
  }
  return out;
}

/** The body of the first `<untrusted label="...">` block with this label, or null. */
export function untrustedBlock(req: ModelRequest, label: string): string | null {
  const open = `<untrusted label="${label}">`;
  for (const text of userTexts(req)) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf("</untrusted>");
    if (start !== -1 && end > start) return text.slice(start + open.length, end);
  }
  return null;
}

function snapshotOf(req: ModelRequest): ContextSnapshot | null {
  const raw = untrustedBlock(req, "student_context");
  if (raw === null) return null;
  try {
    const parsed = ContextSnapshot.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function upcoming(s: ContextSnapshot | null): Deadline[] {
  return [...(s?.deadlines ?? [])].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title));
}

function daysText(daysLeft: number): string {
  if (daysLeft <= 0) return "due today";
  return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
}

/** "Oct 15", like the web's dateShort (R3E-12). */
function describeDeadline(d: Deadline): string {
  return `${d.title} on ${calendarShort(d.dueOn)} (${daysText(d.daysLeft)})`;
}

function planItemFor(d: Deadline): PlanItemInput {
  return {
    title: `Work on ${d.title}`.slice(0, 120),
    kind: d.kind,
    refType: d.refType,
    refId: d.refId,
    minutes: 30,
    valueUsd: d.valueUsd,
    dueOn: d.dueOn,
    contributors: ["compass"],
    weekStart: null,
  };
}

function reply(text: string, o: Partial<CrewReply> = {}): CrewReply {
  return {
    text: text.slice(0, 2000),
    contributors: ["compass"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
    ...o,
  };
}

function compassReply(s: ContextSnapshot | null): CrewReply {
  const [first, second] = upcoming(s);
  if (!first) return reply(NO_DEADLINES_TEXT);
  const text = second
    ? `Your next two deadlines are ${describeDeadline(first)} and ${describeDeadline(second)}. Start with ${first.title}.`
    : `Your next deadline is ${describeDeadline(first)}. Start there this week.`;
  return reply(text, {
    actionCards: [{ kind: "add_plan_item", id: "next-deadline", label: "Add to this week", item: planItemFor(first) }],
  });
}

function weeklyPlan(s: ContextSnapshot | null): { items: PlanItemInput[]; reply: CrewReply } {
  const items = upcoming(s).slice(0, 3).map(planItemFor);
  for (const filler of FILLERS) {
    if (items.length >= 2) break;
    items.push(filler);
  }
  return { items, reply: reply(`Here's your week: ${items.length} steps, nearest deadline first.`) };
}

function specialistResult(role: string): SpecialistResult {
  const parsed = SpecialistRole.safeParse(role);
  const r = parsed.success ? parsed.data : "scout";
  return {
    role: r,
    summary: `${CREW_NAMES[r]} checked your records and has nothing urgent to add.`,
    proposedActions: [],
    factsUsed: [],
    uncertainty: [],
    needsPermission: [],
  };
}

function quillComments(draft: string | null): QuillCommentDraft[] {
  const body = (draft ?? "").trimStart();
  const sentence = /^[^.!?\n]*[.!?]/.exec(body)?.[0] ?? body.split("\n")[0] ?? "";
  const quote = sentence.trim().slice(0, 400);
  if (!quote) return [];
  return [
    {
      quote,
      occurrence: 1,
      kind: "question",
      body: "What were you feeling right at this moment? One concrete detail here would help a reader picture it.",
    },
  ];
}

function submit(name: string, input: unknown): ScriptedTurn {
  return { content: [{ type: "tool_use", name, input }] };
}

const NOTHING: ScriptedTurn = { content: [{ type: "text", text: "The demo crew has nothing to add." }] };

function answer(req: ModelRequest): ScriptedTurn {
  // extract() calls reach the script with no tools.
  if (req.tools.length === 0) return { extract: req.role === "aid" ? DEMO_OFFER : null };
  const names = new Set(req.tools.map((t) => t.name));
  if (names.has("submit_plan")) return submit("submit_plan", weeklyPlan(snapshotOf(req)));
  if (names.has("submit_comments")) {
    const comments = quillComments(untrustedBlock(req, "essay_draft"));
    return comments.length > 0 ? submit("submit_comments", { comments }) : NOTHING;
  }
  if (names.has("submit_result")) return submit("submit_result", specialistResult(req.role));
  if (names.has("submit_reply")) {
    if (req.role === "aid") return submit("submit_reply", reply(APPEAL_TEXT, { contributors: ["aid", "ledger"] }));
    if (req.role === "prep") return submit("submit_reply", reply(RETAKE_TEXT, { contributors: ["prep"] }));
    return submit("submit_reply", compassReply(snapshotOf(req)));
  }
  return NOTHING;
}

type ExtractInput<T> = Omit<Parameters<ModelClient["extract"]>[0], "schema"> & { schema: z.ZodType<T> };

/** Demo-only ModelClient. Clears the scripted client's request log after each call. */
export function createDemoModelClient(): ModelClient {
  const inner = createScriptedModelClient(answer);
  return {
    async turn(req) {
      try {
        return await inner.turn(req);
      } finally {
        inner.requests.length = 0;
      }
    },
    async extract<T>(req: ExtractInput<T>) {
      try {
        return await inner.extract(req);
      } finally {
        inner.extractRequests.length = 0;
      }
    },
  };
}
