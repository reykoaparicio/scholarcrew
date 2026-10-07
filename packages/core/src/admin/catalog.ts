import {
  and,
  asc,
  catalogReports,
  catalogTasks,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  pgErrorCode,
  scholarships,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  type CatalogReport,
  CatalogStatus,
  type CatalogTask,
  CatalogTaskKind,
  CatalogTaskPayload,
  CatalogTaskResolution,
  CatalogTaskStatus,
  type Page,
  ReportStatus,
  ResolveReportInput,
  type Scholarship,
  ScholarshipUpsertInput,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertAdmin, assertSystem } from "../access";
import { recordAudit } from "../audit";
import { escapeLike } from "../scholarships/common";
import { type CoreDeps, one, requireUuid } from "../shared";
import { toCatalogTask, toReport, toScholarship } from "./mappers";

const OPEN_TASK: CatalogTaskStatus[] = ["open", "in_review"];
const LIST_LIMIT = 200;
const ADMIN_PAGE_SIZE = 50;

/** D36: one listing in any status or visibility, for the admin editor. */
export async function getScholarshipForAdmin(deps: CoreDeps, actor: Actor, id: string): Promise<Scholarship> {
  assertAdmin(actor);
  requireUuid(id, "Scholarship not found");
  const [row] = await deps.db.select().from(scholarships).where(eq(scholarships.id, id));
  if (!row) throw notFound("Scholarship not found");
  return toScholarship(row);
}

/** D36: every listing, newest edit first, 50 per page; `q` matches name, provider, or slug. */
export async function listScholarships(
  deps: CoreDeps,
  actor: Actor,
  f: { status?: CatalogStatus; q?: string; page: number },
): Promise<Page<Scholarship>> {
  assertAdmin(actor);
  if (f.status !== undefined && !CatalogStatus.safeParse(f.status).success)
    throw invalidInput("Unknown listing status");
  if (!Number.isInteger(f.page) || f.page < 1) throw invalidInput("Page must be 1 or more");
  const text = f.q?.trim().slice(0, 100);
  const like = text ? `%${escapeLike(text)}%` : null;
  const where = and(
    f.status ? eq(scholarships.status, f.status) : undefined,
    like
      ? or(ilike(scholarships.name, like), ilike(scholarships.provider, like), ilike(scholarships.slug, like))
      : undefined,
  );
  const [total] = await deps.db.select({ n: count() }).from(scholarships).where(where);
  const rows = await deps.db
    .select()
    .from(scholarships)
    .where(where)
    .orderBy(desc(scholarships.updatedAt), asc(scholarships.name))
    .limit(ADMIN_PAGE_SIZE)
    .offset((f.page - 1) * ADMIN_PAGE_SIZE);
  return { items: rows.map(toScholarship), page: f.page, pageSize: ADMIN_PAGE_SIZE, total: total?.n ?? 0 };
}

/** D36: one catalog task with its payload, for the review page. */
export async function getCatalogTask(deps: CoreDeps, actor: Actor, id: string): Promise<CatalogTask> {
  assertAdmin(actor);
  requireUuid(id, "Task not found");
  const [row] = await deps.db.select().from(catalogTasks).where(eq(catalogTasks.id, id));
  if (!row) throw notFound("Task not found");
  return toCatalogTask(row);
}

export async function listCatalogTasks(
  deps: CoreDeps,
  actor: Actor,
  f: { status?: CatalogTaskStatus; kind?: CatalogTaskKind },
): Promise<CatalogTask[]> {
  assertAdmin(actor);
  if (f.status !== undefined && !CatalogTaskStatus.safeParse(f.status).success)
    throw invalidInput("Unknown task status");
  if (f.kind !== undefined && !CatalogTaskKind.safeParse(f.kind).success) throw invalidInput("Unknown task kind");
  const rows = await deps.db
    .select()
    .from(catalogTasks)
    .where(
      and(f.status ? eq(catalogTasks.status, f.status) : undefined, f.kind ? eq(catalogTasks.kind, f.kind) : undefined),
    )
    .orderBy(asc(catalogTasks.createdAt), asc(catalogTasks.id))
    .limit(LIST_LIMIT);
  return rows.map(toCatalogTask);
}

export async function createCatalogTask(
  deps: CoreDeps,
  system: Actor,
  i: { kind: CatalogTaskKind; payload: CatalogTaskPayload; scholarshipId?: string; createdById?: string },
): Promise<CatalogTask> {
  assertSystem(system);
  const payload = CatalogTaskPayload.safeParse(i.payload);
  if (!payload.success) throw invalidInput("Bad catalog task payload", payload.error.issues);
  if (payload.data.type !== i.kind) throw invalidInput("Task kind and payload type must match");
  const row = one(
    await deps.db
      .insert(catalogTasks)
      .values({
        kind: i.kind,
        payload: payload.data,
        scholarshipId: i.scholarshipId ?? null,
        createdById: i.createdById ?? null,
        createdAt: deps.clock.now(),
      })
      .returning(),
    "catalog_tasks insert",
  );
  return toCatalogTask(row);
}

/**
 * Only an admin publishes (CA-04). Publishing sets public visibility, the verified date, and the verifier.
 * Rejecting a `recheck_changed` task restores a `stale` listing to `published` (R2C-7).
 */
export async function resolveCatalogTask(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  r: CatalogTaskResolution,
): Promise<CatalogTask> {
  assertAdmin(actor);
  requireUuid(id, "Task not found");
  const parsed = CatalogTaskResolution.safeParse(r);
  if (!parsed.success) throw invalidInput("Check the resolution and try again", parsed.error.issues);
  const v = parsed.data;
  if (v.publishScholarshipId && v.status !== "resolved")
    throw invalidInput("Only a resolved task can publish a listing");
  const [task] = await deps.db.select().from(catalogTasks).where(eq(catalogTasks.id, id));
  if (!task) throw notFound("Task not found");
  if (!OPEN_TASK.includes(task.status)) throw conflict("This task is already closed");
  const now = deps.clock.now();
  const updated = await deps.db.transaction(async (tx) => {
    if (v.publishScholarshipId) {
      const published = await tx
        .update(scholarships)
        .set({ status: "published", visibility: "public", verifiedAt: now, verifiedById: actor.userId, updatedAt: now })
        .where(eq(scholarships.id, v.publishScholarshipId))
        .returning({ id: scholarships.id });
      if (published.length === 0) throw notFound("Scholarship not found");
    }
    // R2C-7 (CA-05): rejecting a re-check means "keep the listing as it is", so a stale listing goes back to
    // published with a fresh verification. Other statuses (retired, flagged) and other task kinds don't change.
    if (task.kind === "recheck_changed" && v.status === "rejected" && task.scholarshipId) {
      await tx
        .update(scholarships)
        .set({ status: "published", verifiedAt: now, verifiedById: actor.userId, updatedAt: now })
        .where(and(eq(scholarships.id, task.scholarshipId), eq(scholarships.status, "stale")));
    }
    return one(
      await tx
        .update(catalogTasks)
        .set({
          status: v.status,
          resolvedById: actor.userId,
          resolutionNote: v.note,
          resolvedAt: now,
          scholarshipId: task.scholarshipId ?? v.publishScholarshipId,
        })
        .where(eq(catalogTasks.id, id))
        .returning(),
      "catalog_tasks update",
    );
  });
  await recordAudit(deps, {
    actor,
    action: "catalog_task_resolved",
    entityType: "catalog_task",
    entityId: id,
    meta: { status: v.status, publishedScholarshipId: v.publishScholarshipId },
  });
  return toCatalogTask(updated);
}

export async function upsertScholarship(deps: CoreDeps, actor: Actor, i: ScholarshipUpsertInput): Promise<Scholarship> {
  assertAdmin(actor);
  const parsed = ScholarshipUpsertInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the listing and try again", parsed.error.issues);
  const { id, ...fields } = parsed.data;
  const now = deps.clock.now();
  try {
    if (id === null) {
      const row = one(
        await deps.db
          .insert(scholarships)
          .values({ ...fields, createdAt: now, updatedAt: now })
          .returning(),
        "scholarships insert",
      );
      await recordAudit(deps, { actor, action: "scholarship_created", entityType: "scholarship", entityId: row.id });
      return toScholarship(row);
    }
    const [row] = await deps.db
      .update(scholarships)
      .set({ ...fields, updatedAt: now })
      .where(eq(scholarships.id, id))
      .returning();
    if (!row) throw notFound("Scholarship not found");
    await recordAudit(deps, { actor, action: "scholarship_updated", entityType: "scholarship", entityId: row.id });
    return toScholarship(row);
  } catch (e) {
    if (pgErrorCode(e) === "23505") throw conflict("Another listing already uses that slug");
    throw e;
  }
}

export async function setScholarshipStatus(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  status: CatalogStatus,
  note?: string,
): Promise<Scholarship> {
  assertAdmin(actor);
  requireUuid(id, "Scholarship not found");
  if (!CatalogStatus.safeParse(status).success) throw invalidInput("Unknown listing status");
  const now = deps.clock.now();
  const set: Partial<typeof scholarships.$inferInsert> = { status, updatedAt: now };
  if (status === "published") {
    set.visibility = "public";
    set.verifiedAt = now;
    set.verifiedById = actor.userId;
  }
  const [row] = await deps.db.update(scholarships).set(set).where(eq(scholarships.id, id)).returning();
  if (!row) throw notFound("Scholarship not found");
  await recordAudit(deps, {
    actor,
    action: "scholarship_status_set",
    entityType: "scholarship",
    entityId: id,
    meta: { status, note: (note ?? "").slice(0, 1000) },
  });
  return toScholarship(row);
}

async function reportsWhere(deps: CoreDeps, where: ReturnType<typeof eq> | undefined): Promise<CatalogReport[]> {
  const rows = await deps.db
    .select({ report: catalogReports, name: scholarships.name })
    .from(catalogReports)
    .innerJoin(scholarships, eq(scholarships.id, catalogReports.scholarshipId))
    .where(where)
    .orderBy(asc(catalogReports.createdAt), asc(catalogReports.id))
    .limit(LIST_LIMIT);
  return rows.map((r) => toReport(r.report, r.name));
}

export async function listReports(deps: CoreDeps, actor: Actor, status?: ReportStatus): Promise<CatalogReport[]> {
  assertAdmin(actor);
  if (status !== undefined && !ReportStatus.safeParse(status).success) throw invalidInput("Unknown report status");
  return reportsWhere(deps, status ? eq(catalogReports.status, status) : undefined);
}

/** Closes the report and the open review task that points at it. */
export async function resolveReport(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  i: { status: "resolved" | "rejected"; note: string },
): Promise<CatalogReport> {
  assertAdmin(actor);
  requireUuid(id, "Report not found");
  const parsed = ResolveReportInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the resolution and try again", parsed.error.issues);
  const v = parsed.data;
  const [report] = await deps.db.select().from(catalogReports).where(eq(catalogReports.id, id));
  if (!report) throw notFound("Report not found");
  if (report.status !== "open") throw conflict("This report is already closed");
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    await tx.update(catalogReports).set({ status: v.status, resolvedAt: now }).where(eq(catalogReports.id, id));
    await tx
      .update(catalogTasks)
      .set({ status: v.status, resolvedById: actor.userId, resolutionNote: v.note, resolvedAt: now })
      .where(
        and(
          eq(catalogTasks.kind, "report"),
          inArray(catalogTasks.status, OPEN_TASK),
          sql`${catalogTasks.payload}->>'reportId' = ${id}`,
        ),
      );
  });
  await recordAudit(deps, {
    actor,
    action: "report_resolved",
    entityType: "catalog_report",
    entityId: id,
    meta: { status: v.status },
  });
  const [out] = await reportsWhere(deps, eq(catalogReports.id, id));
  if (!out) throw notFound("Report not found");
  return out;
}
