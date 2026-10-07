import { z } from "zod";
import { AppPlan, Fit } from "./colleges";
import { ShareCategory } from "./common";
import { CrewRole, HttpUrl, Id, IsoDate, IsoDateTime, SpecialistRole, Usd } from "./common";
import { EssayInput } from "./essays";
import { DecisionInput, FactInput } from "./memory";
import { CostSummary } from "./money";
import { Deadline, PlanItem, PlanItemInput, WeekPlan } from "./plan";
import { SweepSummary } from "./scholarships";

export const RoomKind = z.enum(["my_crew", "family", "temporary", "scholarship", "college", "essay"]);
export type RoomKind = z.infer<typeof RoomKind>;

export const Conversation = z.strictObject({
  id: Id,
  room: RoomKind,
  roomRefId: z.string().nullable(),
  familyId: Id.nullable(),
  title: z.string(),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
  lastMessageAt: IsoDateTime.nullable(),
});
export type Conversation = z.infer<typeof Conversation>;

export const ConversationInput = z.strictObject({
  room: RoomKind,
  roomRefId: z.string().max(64).nullable().default(null),
  familyId: Id.nullable().default(null),
  title: z.string().max(120).default(""),
});
export type ConversationInput = z.infer<typeof ConversationInput>;

export const CardId = z.string().regex(/^[a-z0-9_-]{1,32}$/);
const CardLabel = z.string().min(1).max(80);
/** Internal app paths only: starts with "/" but not "//". */
export const InternalHref = z
  .string()
  .max(300)
  .regex(/^\/(?![\/\\])[^\s\\]*$/);

export const ActionCard = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("add_plan_item"), id: CardId, label: CardLabel, item: PlanItemInput }),
  z.strictObject({ kind: z.literal("save_scholarship"), id: CardId, label: CardLabel, scholarshipId: Id }),
  z.strictObject({
    kind: z.literal("add_college"),
    id: CardId,
    label: CardLabel,
    collegeId: z.string().min(1).max(12),
    fit: Fit,
    plan: AppPlan,
  }),
  z.strictObject({ kind: z.literal("start_essay"), id: CardId, label: CardLabel, essay: EssayInput }),
  z.strictObject({ kind: z.literal("open_link"), id: CardId, label: CardLabel, href: InternalHref }),
  z.strictObject({ kind: z.literal("record_decision"), id: CardId, label: CardLabel, decision: DecisionInput }),
  z.strictObject({ kind: z.literal("confirm_fact"), id: CardId, label: CardLabel, fact: FactInput }),
]);
export type ActionCard = z.infer<typeof ActionCard>;
export type ActionCardKind = ActionCard["kind"];

export const ReceiptItem = z.strictObject({
  kind: z.enum(["fact", "record", "catalog", "calculation"]),
  label: z.string().min(1).max(140),
  refId: z.string().max(64).nullable(),
  sourceUrl: HttpUrl.nullable(),
  verifiedAt: IsoDateTime.nullable(),
});
export type ReceiptItem = z.infer<typeof ReceiptItem>;

export const SafetyFlag = z.enum(["crisis", "refusal", "limit", "partial"]);
export type SafetyFlag = z.infer<typeof SafetyFlag>;

export const CrewReply = z.strictObject({
  text: z.string().min(1).max(2000),
  contributors: z.array(CrewRole).min(1).max(8),
  question: z.string().max(300).nullable(),
  actionCards: z.array(ActionCard).max(4),
  receipt: z.array(ReceiptItem).max(12),
  safety: SafetyFlag.nullable(),
  needsInput: z.boolean(),
});
export type CrewReply = z.infer<typeof CrewReply>;

export const ProposedAction = z.strictObject({
  title: z.string().min(1).max(120),
  minutes: z.number().int().min(0).max(600),
  dueOn: IsoDate.nullable(),
  valueUsd: Usd.nullable(),
  refType: z.string().max(40).nullable(),
  refId: z.string().max(64).nullable(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

export const FactUsed = z.strictObject({
  claim: z.string().min(1).max(200),
  source: z.enum(["profile", "record", "catalog", "calculation", "document"]),
  refId: z.string().max(64).nullable(),
  verifiedAt: IsoDateTime.nullable(),
});
export type FactUsed = z.infer<typeof FactUsed>;

export const SpecialistResult = z.strictObject({
  role: SpecialistRole,
  summary: z.string().max(1200),
  proposedActions: z.array(ProposedAction).max(6),
  factsUsed: z.array(FactUsed).max(12),
  uncertainty: z.array(z.string().max(200)).max(6),
  needsPermission: z.array(z.string().max(120)).max(4),
});
export type SpecialistResult = z.infer<typeof SpecialistResult>;

export const MessageAuthor = z.enum(["user", "crew"]);
export type MessageAuthor = z.infer<typeof MessageAuthor>;

/** Who said a history line, as Compass labels it (D42, R2C-1). */
export const CrewSpeaker = z.enum(["student", "parent", "crew"]);
export type CrewSpeaker = z.infer<typeof CrewSpeaker>;

/** Who asked the current request. `firstName` may be "" when the account has no name. */
export const CrewRequester = z.strictObject({ role: z.enum(["student", "parent"]), firstName: z.string().max(60) });
export type CrewRequester = z.infer<typeof CrewRequester>;

export const Message = z.strictObject({
  id: Id,
  conversationId: Id,
  authorKind: MessageAuthor,
  authorUserId: Id.nullable(),
  body: z.string(),
  reply: CrewReply.nullable(),
  createdAt: IsoDateTime,
  appliedCardIds: z.array(z.string()),
  sharedCategories: z.array(ShareCategory).nullable(),
});
export type Message = z.infer<typeof Message>;

export const SendMessageInput = z.strictObject({ body: z.string().trim().min(1).max(4000) });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const JobKind = z.enum([
  "crew_request",
  "weekly_plan",
  "essay_review",
  "offer_parse",
  "appeal_outline",
  "retake_analysis",
]);
export type JobKind = z.infer<typeof JobKind>;

export const JobStatus = z.enum(["queued", "working", "ready", "needs_input", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;
export const TERMINAL_JOB_STATUSES: JobStatus[] = ["ready", "needs_input", "failed"];

export const ProgressEvent = z.strictObject({
  at: IsoDateTime,
  role: z.union([CrewRole, z.literal("system")]),
  text: z.string().max(200),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

export const CrewJob = z.strictObject({
  id: Id,
  kind: JobKind,
  status: JobStatus,
  conversationId: Id.nullable(),
  requestMessageId: Id.nullable(),
  resultMessageId: Id.nullable(),
  refId: z.string().nullable(),
  progress: z.array(ProgressEvent),
  error: z.string().nullable(),
  safety: SafetyFlag.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type CrewJob = z.infer<typeof CrewJob>;

export const ApplyActionInput = z.strictObject({ messageId: Id, cardId: CardId });
export type ApplyActionInput = z.infer<typeof ApplyActionInput>;

export const ActionReceipt = z.strictObject({
  id: Id,
  messageId: Id,
  cardId: z.string(),
  appliedAt: IsoDateTime,
  result: z.record(z.string(), z.unknown()),
});
export type ActionReceipt = z.infer<typeof ActionReceipt>;

export const AgentRunRecord = z.strictObject({
  jobId: Id.nullable(),
  userId: Id.nullable(),
  role: z.string(),
  model: z.string(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadTokens: z.number().int().min(0),
  cacheWriteTokens: z.number().int().min(0),
  stopReason: z.string(),
  costMicros: z.number().int().min(0),
  durationMs: z.number().int().min(0),
});
export type AgentRunRecord = z.infer<typeof AgentRunRecord>;

/** Everything Compass and specialists see about the student up front. Built by the CrewDataPort. */
export const ContextSnapshot = z.strictObject({
  privateMatchCount: z.number().int().min(0),
  ownerId: Id,
  displayName: z.string(),
  today: IsoDate,
  timeZone: z.string(),
  audience: z.enum(["crew", "family"]),
  room: RoomKind,
  roomRef: z.strictObject({ type: z.string(), id: z.string() }).nullable(),
  profile: z.strictObject({
    classYear: z.number().int().nullable(),
    state: z.string(),
    county: z.string(),
    gpa: z.number().nullable(),
    intendedMajors: z.array(z.string()),
    interests: z.array(z.string()),
  }),
  facts: z.array(z.strictObject({ id: Id, key: z.string(), value: z.string(), source: z.string() })),
  decisions: z.array(z.strictObject({ id: Id, summary: z.string(), decidedAt: IsoDateTime })),
  weekPlan: WeekPlan,
  deadlines: z.array(Deadline),
  colleges: z.array(z.strictObject({ id: z.string(), name: z.string(), fit: Fit, plan: AppPlan })),
  enabledSpecialists: z.array(SpecialistRole),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshot>;

export const CrewRequestInput = z.strictObject({
  jobId: Id,
  ownerId: Id,
  conversationId: Id,
  room: RoomKind,
  roomRef: z.strictObject({ type: z.string(), id: z.string() }).nullable(),
  audience: z.enum(["crew", "family"]),
  /** Who sent this request; a parent in a family room is not the student (D42, R2C-1). */
  requester: CrewRequester,
  userText: z.string().min(1).max(4000),
  history: z.array(z.strictObject({ author: MessageAuthor, speaker: CrewSpeaker, text: z.string() })).max(10),
  mentions: z.array(CrewRole),
});
export type CrewRequestInput = z.infer<typeof CrewRequestInput>;

export const CrewRunResult = z.strictObject({
  reply: CrewReply,
  status: z.enum(["ready", "needs_input", "failed"]),
  safety: SafetyFlag.nullable(),
  consulted: z.array(SpecialistRole),
});
export type CrewRunResult = z.infer<typeof CrewRunResult>;

export const ThisWeekView = z.strictObject({
  greetingName: z.string(),
  weekStart: IsoDate,
  nextStep: PlanItem.nullable(),
  plan: WeekPlan,
  gap: CostSummary.nullable(),
  deadlines: z.array(Deadline).max(4),
  sweep: SweepSummary.nullable(),
  crewWorking: z.boolean(),
});
export type ThisWeekView = z.infer<typeof ThisWeekView>;

/** Parse "@Scout what's due" → ["scout"]. Case-insensitive, only known names. */
export function parseMentions(text: string): CrewRole[] {
  const found = new Set<CrewRole>();
  for (const m of text.matchAll(/@([A-Za-z]+)/g)) {
    const name = m[1]?.toLowerCase();
    const parsed = CrewRole.safeParse(name);
    if (parsed.success) found.add(parsed.data);
  }
  return [...found];
}
