import {
  type DbOrTx,
  agentRuns,
  and,
  conversations,
  crewJobs,
  desc,
  eq,
  exportsTable,
  familyMembers,
  inArray,
  isNull,
  lt,
  messages,
  or,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  AgentRunRecord,
  type CrewJob,
  CrewReply,
  JOB_KIND_QUEUE,
  type JobKind,
  type JobStatus,
  ProgressEvent,
  QUEUE_EXPIRE_SECONDS,
  type SafetyFlag,
  type ShareCategory,
  TERMINAL_JOB_STATUSES,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { addUsage } from "../billing/plans";
import { markOfferFailed } from "../money/offers";
import { notify } from "../notifications";
import { type CoreDeps, one, requireUuid } from "../shared";
import { type JobRow, toCrewJob } from "./mappers";

type NotifiedKind = Exclude<JobKind, "crew_request">;

/** R2P-9: `link` gets the conversation the reply landed in (null when there was no reply). */
const READY_NOTICE: Record<
  NotifiedKind,
  { title: string; link: (refId: string | null, conversationId: string | null) => string }
> = {
  weekly_plan: { title: "Your weekly plan is ready", link: () => "/week" },
  essay_review: { title: "Quill reviewed your essay", link: (r) => (r ? `/essays/${r}` : "/essays") },
  offer_parse: {
    title: "Your award letter is ready to review",
    link: (r) => (r ? `/money/offers/${r}` : "/money/offers"),
  },
  appeal_outline: {
    title: "Your appeal outline is ready",
    link: (r, c) => (c ? `/crew/${c}` : r ? `/money/offers/${r}` : "/money/offers"),
  },
  retake_analysis: { title: "Your retake analysis is ready", link: (_r, c) => (c ? `/crew/${c}` : "/prep") },
};

const ROOM_TITLES: Record<JobKind, string> = {
  crew_request: "My Crew",
  weekly_plan: "Weekly plan",
  essay_review: "Essay review",
  offer_parse: "Award letter",
  appeal_outline: "Appeal outline",
  retake_analysis: "Retake analysis",
};

/** Inserts a queued crew job. No access or allowance check; callers do both. */
export async function insertJob(
  db: DbOrTx,
  i: {
    ownerId: string;
    kind: JobKind;
    now: Date;
    refId?: string | null;
    conversationId?: string | null;
    requestMessageId?: string | null;
  },
): Promise<CrewJob> {
  const row = one(
    await db
      .insert(crewJobs)
      .values({
        ownerId: i.ownerId,
        kind: i.kind,
        refId: i.refId ?? null,
        conversationId: i.conversationId ?? null,
        requestMessageId: i.requestMessageId ?? null,
        usageMonth: i.now.toISOString().slice(0, 7),
        createdAt: i.now,
        updatedAt: i.now,
      })
      .returning(),
    "crew_jobs insert",
  );
  return toCrewJob(row);
}

async function jobRow(db: DbOrTx, id: string): Promise<JobRow | undefined> {
  const [row] = await db.select().from(crewJobs).where(eq(crewJobs.id, id));
  return row;
}

/** True when the conversation is a family room and `userId` belongs to that family. */
export async function inFamilyRoom(db: DbOrTx, conversationId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(familyMembers, eq(familyMembers.familyId, conversations.familyId))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.room, "family"), eq(familyMembers.userId, userId)),
    );
  return rows.length > 0;
}

export async function createJob(
  deps: CoreDeps,
  actor: Actor,
  i: { kind: JobKind; refId?: string; conversationId?: string },
): Promise<CrewJob> {
  assertUser(actor);
  if (i.conversationId !== undefined) {
    requireUuid(i.conversationId, "Conversation not found");
    const [conv] = await deps.db
      .select({ ownerId: conversations.ownerId })
      .from(conversations)
      .where(eq(conversations.id, i.conversationId));
    if (!conv || conv.ownerId !== actor.userId) throw notFound("Conversation not found");
  }
  return insertJob(deps.db, {
    ownerId: actor.userId,
    kind: i.kind,
    refId: i.refId ?? null,
    conversationId: i.conversationId ?? null,
    now: deps.clock.now(),
  });
}

export async function getJob(deps: CoreDeps, actor: Actor, id: string): Promise<CrewJob> {
  requireUuid(id, "Job not found");
  const row = await jobRow(deps.db, id);
  if (!row) throw notFound("Job not found");
  if (actor.kind === "system") return toCrewJob(row);
  assertUser(actor);
  if (row.ownerId === actor.userId) return toCrewJob(row);
  if (row.conversationId && (await inFamilyRoom(deps.db, row.conversationId, actor.userId))) return toCrewJob(row);
  throw notFound("Job not found");
}

const ACTIVE_JOB_STATUSES: JobStatus[] = ["queued", "working"];

/**
 * D28: the actor's own jobs, newest first, for the crew side panel, plus (R2C-11) jobs the actor asked for
 * in a family room they still belong to (those jobs are owned by the student). `limit` is clamped to 1..50
 * (default 20).
 */
export async function listJobs(
  deps: CoreDeps,
  actor: Actor,
  o: { active?: boolean; limit?: number } = {},
): Promise<CrewJob[]> {
  assertUser(actor);
  const requested = o.limit !== undefined && Number.isFinite(o.limit) ? Math.trunc(o.limit) : 20;
  const limit = Math.min(50, Math.max(1, requested));
  const familyRequests = deps.db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(
      familyMembers,
      and(eq(familyMembers.familyId, conversations.familyId), eq(familyMembers.userId, actor.userId)),
    )
    .where(and(eq(messages.authorUserId, actor.userId), eq(conversations.room, "family")));
  const visible = or(eq(crewJobs.ownerId, actor.userId), inArray(crewJobs.requestMessageId, familyRequests));
  const rows = await deps.db
    .select()
    .from(crewJobs)
    .where(o.active ? and(visible, inArray(crewJobs.status, ACTIVE_JOB_STATUSES)) : visible)
    .orderBy(desc(crewJobs.createdAt))
    .limit(limit);
  return rows.map(toCrewJob);
}

/** Atomically claims a queued job or replaces an expired lease. */
export async function startJob(
  deps: CoreDeps,
  system: Actor,
  id: string,
  o: { leaseSeconds: number },
): Promise<{ job: CrewJob; leaseToken: string } | null> {
  assertSystem(system);
  requireUuid(id, "Job not found");
  const now = deps.clock.now();
  const [row] = await deps.db
    .update(crewJobs)
    .set({
      status: "working",
      attempt: sql`${crewJobs.attempt} + 1`,
      leaseToken: sql`gen_random_uuid()`,
      leaseExpiresAt: new Date(now.getTime() + o.leaseSeconds * 1000),
      updatedAt: now,
    })
    .where(
      and(
        eq(crewJobs.id, id),
        or(eq(crewJobs.status, "queued"), and(eq(crewJobs.status, "working"), lt(crewJobs.leaseExpiresAt, now))),
      ),
    )
    .returning();
  return row?.leaseToken ? { job: toCrewJob(row), leaseToken: row.leaseToken } : null;
}

export async function releaseJob(deps: CoreDeps, system: Actor, id: string, leaseToken: string): Promise<void> {
  assertSystem(system);
  await deps.db
    .update(crewJobs)
    .set({ status: "queued", leaseToken: null, leaseExpiresAt: null, updatedAt: deps.clock.now() })
    .where(and(eq(crewJobs.id, id), eq(crewJobs.status, "working"), eq(crewJobs.leaseToken, leaseToken)));
}

export async function appendProgress(deps: CoreDeps, system: Actor, id: string, e: ProgressEvent): Promise<void> {
  assertSystem(system);
  requireUuid(id, "Job not found");
  const parsed = ProgressEvent.safeParse(e);
  if (!parsed.success) throw invalidInput("Bad progress event", parsed.error.issues);
  const rows = await deps.db
    .update(crewJobs)
    .set({
      progress: sql`${crewJobs.progress} || ${JSON.stringify([parsed.data])}::jsonb`,
      updatedAt: deps.clock.now(),
    })
    .where(eq(crewJobs.id, id))
    .returning({ id: crewJobs.id });
  if (rows.length === 0) throw notFound("Job not found");
}

function noticeBody(status: "ready" | "needs_input" | "failed"): string {
  if (status === "failed") return "We couldn't finish this one. Try again in a few minutes.";
  if (status === "needs_input") return "Your crew has a question for you.";
  return "Open it to take a look.";
}

export async function completeJob(
  deps: CoreDeps,
  system: Actor,
  i: {
    jobId: string;
    leaseToken: string;
    sharedCategories?: ShareCategory[];
    usage?: { costMicros: number; crewRequest: boolean };
    reply: CrewReply | null;
    status: "ready" | "needs_input" | "failed";
    error?: string;
    safety?: SafetyFlag;
  },
): Promise<{ job: CrewJob; completed: boolean }> {
  assertSystem(system);
  requireUuid(i.jobId, "Job not found");
  const job = await jobRow(deps.db, i.jobId);
  if (!job) throw notFound("Job not found");
  let reply: CrewReply | null = null;
  if (i.reply) {
    const parsed = CrewReply.safeParse(i.reply);
    if (!parsed.success) throw invalidInput("Bad crew reply", parsed.error.issues);
    reply = parsed.data;
  }
  const now = deps.clock.now();
  const result = await deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(crewJobs).where(eq(crewJobs.id, i.jobId)).for("update");
    if (!locked) throw notFound("Job not found");
    if (TERMINAL_JOB_STATUSES.includes(locked.status) || locked.leaseToken !== i.leaseToken)
      return { row: locked, completed: false };
    let conversationId = job.conversationId;
    let resultMessageId = job.resultMessageId;
    if (reply) {
      if (!conversationId) {
        // R2C-14: reuse the owner's newest live room for this kind before opening a new one.
        const title = ROOM_TITLES[job.kind];
        const [existing] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.ownerId, job.ownerId),
              eq(conversations.room, "my_crew"),
              eq(conversations.title, title),
              isNull(conversations.roomRefId),
              isNull(conversations.archivedAt),
            ),
          )
          .orderBy(desc(conversations.createdAt))
          .limit(1);
        conversationId =
          existing?.id ??
          one(
            await tx
              .insert(conversations)
              .values({ ownerId: job.ownerId, room: "my_crew", title, createdAt: now })
              .returning(),
            "conversations insert",
          ).id;
      }
      const message = one(
        await tx
          .insert(messages)
          .values({
            conversationId,
            authorKind: "crew",
            authorUserId: null,
            body: reply.text,
            reply,
            sharedCategories: i.sharedCategories ?? null,
            createdAt: now,
          })
          .returning(),
        "messages insert",
      );
      resultMessageId = message.id;
    }
    const billableCost = Math.max(locked.costMicros, i.usage?.costMicros ?? 0);
    if (billableCost > 0 || i.usage?.crewRequest)
      await addUsage(tx, {
        userId: locked.ownerId,
        month: locked.usageMonth,
        costMicros: billableCost,
        crewRequest: i.usage?.crewRequest ?? false,
      });
    const row = one(
      await tx
        .update(crewJobs)
        .set({
          status: i.status,
          leaseToken: null,
          leaseExpiresAt: null,
          conversationId,
          resultMessageId,
          error: i.error ?? null,
          safety: i.safety ?? reply?.safety ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(crewJobs.id, job.id),
            eq(crewJobs.leaseToken, i.leaseToken),
            inArray(crewJobs.status, ["queued", "working"]),
          ),
        )
        .returning(),
      "crew_jobs update",
    );
    return { row, completed: true };
  });
  if (!result.completed) return { job: toCrewJob(result.row), completed: false };
  const updated = result.row;
  const kind = job.kind;
  if (kind !== "crew_request") {
    const notice = READY_NOTICE[kind];
    await notify(deps, system, {
      userId: job.ownerId,
      kind: "job_ready",
      title: i.status === "failed" ? `${ROOM_TITLES[kind]} didn't finish` : notice.title,
      body: noticeBody(i.status),
      link: notice.link(job.refId, updated.conversationId),
      dedupeKey: `job:${job.id}`,
    });
  }
  return { job: toCrewJob(updated), completed: true };
}

export const STALE_JOB_TEXT = "This took too long and stopped. Try it again.";
const REAPER_MARGIN_SECONDS = 600;

export async function reapStaleJobs(deps: CoreDeps, system: Actor): Promise<{ jobs: number; exports: number }> {
  assertSystem(system);
  const now = deps.clock.now();
  const rows = await deps.db
    .select()
    .from(crewJobs)
    .where(inArray(crewJobs.status, ["queued", "working"]));
  let jobs = 0;
  for (const row of rows) {
    const expiry =
      row.leaseExpiresAt?.getTime() ?? row.updatedAt.getTime() + QUEUE_EXPIRE_SECONDS[JOB_KIND_QUEUE[row.kind]] * 1000;
    if (expiry >= now.getTime() - REAPER_MARGIN_SECONDS * 1000) continue;
    const failed = await deps.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(crewJobs).where(eq(crewJobs.id, row.id)).for("update");
      if (
        !locked ||
        !["queued", "working"].includes(locked.status) ||
        locked.updatedAt.getTime() !== row.updatedAt.getTime() ||
        locked.leaseToken !== row.leaseToken
      )
        return null;
      if (locked.costMicros > 0)
        await addUsage(tx, {
          userId: locked.ownerId,
          month: locked.usageMonth,
          costMicros: locked.costMicros,
          crewRequest: false,
        });
      return one(
        await tx
          .update(crewJobs)
          .set({ status: "failed", error: STALE_JOB_TEXT, leaseToken: null, leaseExpiresAt: null, updatedAt: now })
          .where(eq(crewJobs.id, row.id))
          .returning(),
        "stale job",
      );
    });
    if (!failed) continue;
    jobs += 1;
    if (row.kind === "offer_parse" && row.refId)
      await markOfferFailed(deps, system, { offerId: row.refId, ownerId: row.ownerId, error: STALE_JOB_TEXT });
    const link =
      row.kind === "crew_request"
        ? `/crew/${row.conversationId}`
        : READY_NOTICE[row.kind].link(row.refId, row.conversationId);
    await notify(deps, system, {
      userId: row.ownerId,
      kind: "job_ready",
      title: `${ROOM_TITLES[row.kind]} didn't finish`,
      body: STALE_JOB_TEXT,
      link,
      dedupeKey: `job:${row.id}`,
    });
  }
  const abandoned = await deps.db
    .update(exportsTable)
    .set({ status: "failed", expiresAt: new Date(now.getTime() + 86_400_000) })
    .where(and(eq(exportsTable.status, "queued"), lt(exportsTable.createdAt, new Date(now.getTime() - 3_600_000))))
    .returning();
  for (const row of abandoned)
    await notify(deps, system, {
      userId: row.userId,
      kind: "job_ready",
      title: "Your export didn't finish",
      body: STALE_JOB_TEXT,
      link: "/settings",
      dedupeKey: `export:${row.id}`,
    });
  return { jobs, exports: abandoned.length };
}

export async function recordAgentRun(
  deps: CoreDeps,
  system: Actor,
  r: AgentRunRecord,
  o: { leaseToken?: string } = {},
): Promise<void> {
  assertSystem(system);
  const now = deps.clock.now();
  // Cost is durable even if optional telemetry validation/insertion fails. All attempts accumulate on the job.
  if (r.jobId && r.userId && Number.isSafeInteger(r.costMicros) && r.costMicros >= 0) {
    await deps.db
      .update(crewJobs)
      .set({ costMicros: sql`${crewJobs.costMicros} + ${r.costMicros}` })
      .where(
        and(
          eq(crewJobs.id, r.jobId),
          eq(crewJobs.ownerId, r.userId),
          inArray(crewJobs.status, ["queued", "working"]),
          o.leaseToken ? eq(crewJobs.leaseToken, o.leaseToken) : undefined,
        ),
      );
  }
  const parsed = AgentRunRecord.safeParse(r);
  if (!parsed.success) throw invalidInput("Bad agent run record", parsed.error.issues);
  await deps.db.insert(agentRuns).values({ ...parsed.data, createdAt: now });
}
