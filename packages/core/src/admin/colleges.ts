import { and, auditEvents, colleges, count, desc, eq, inArray, sql } from "@scholarcrew/db";
import {
  type Actor,
  type AuditEvent,
  AuditQuery,
  CollegeDeadlines,
  CollegeImportRow,
  CollegeRequirements,
  type ImportResult,
  type Page,
  ResearchInput,
  USState,
  invalidInput,
} from "@scholarcrew/domain";
import { assertAdmin } from "../access";
import { recordAudit } from "../audit";
import type { CoreDeps } from "../shared";
import { toAuditEvent } from "./mappers";

const IMPORT_CHUNK = 500;
export const AUDIT_PAGE_SIZE = 20;

/**
 * Upserts Scorecard rows by IPEDS id. New colleges get empty deadlines, default requirements, and no merit tiers;
 * existing colleges only refresh name, state, city, control, admit rate, cost, and net price.
 */
export async function importColleges(deps: CoreDeps, actor: Actor, rows: CollegeImportRow[]): Promise<ImportResult> {
  assertAdmin(actor);
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const byId = new Map<string, CollegeImportRow>();
  for (let idx = 0; idx < rows.length; idx += 1) {
    const parsed = CollegeImportRow.safeParse(rows[idx]);
    if (!parsed.success) {
      result.skipped += 1;
      result.errors.push({ line: idx + 1, message: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    if (byId.has(parsed.data.id)) result.skipped += 1;
    byId.set(parsed.data.id, parsed.data);
  }
  const valid = [...byId.values()];
  const now = deps.clock.now();
  const deadlines = CollegeDeadlines.parse({ rolling: false });
  const requirements = CollegeRequirements.parse({});
  await deps.db.transaction(async (tx) => {
    for (let start = 0; start < valid.length; start += IMPORT_CHUNK) {
      const chunk = valid.slice(start, start + IMPORT_CHUNK);
      const existing = await tx
        .select({ id: colleges.id })
        .from(colleges)
        .where(
          inArray(
            colleges.id,
            chunk.map((r) => r.id),
          ),
        );
      result.updated += existing.length;
      result.inserted += chunk.length - existing.length;
      await tx
        .insert(colleges)
        .values(
          chunk.map((r) => ({
            id: r.id,
            name: r.name,
            state: r.state,
            city: r.city,
            control: r.control,
            admitRateX1000: r.admitRate === null ? null : Math.round(r.admitRate * 1000),
            costOfAttendanceUsd: r.costOfAttendanceUsd,
            netPriceByIncome: r.netPriceByIncome,
            deadlines,
            requirements,
            meritTiers: [],
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: colleges.id,
          set: {
            name: sql`excluded.name`,
            state: sql`excluded.state`,
            city: sql`excluded.city`,
            control: sql`excluded.control`,
            admitRateX1000: sql`excluded.admit_rate_x1000`,
            costOfAttendanceUsd: sql`excluded.cost_of_attendance_usd`,
            netPriceByIncome: sql`excluded.net_price_by_income`,
            updatedAt: now,
          },
        });
    }
  });
  await recordAudit(deps, {
    actor,
    action: "colleges_imported",
    entityType: "colleges",
    entityId: "scorecard",
    meta: { inserted: result.inserted, updated: result.updated, skipped: result.skipped },
  });
  return result;
}

export async function searchAudit(deps: CoreDeps, actor: Actor, q: AuditQuery): Promise<Page<AuditEvent>> {
  assertAdmin(actor);
  const parsed = AuditQuery.safeParse(q);
  if (!parsed.success) throw invalidInput("Check the search and try again", parsed.error.issues);
  const v = parsed.data;
  const where = and(
    v.actorId ? eq(auditEvents.actorId, v.actorId) : undefined,
    v.entityType ? eq(auditEvents.entityType, v.entityType) : undefined,
    v.entityId ? eq(auditEvents.entityId, v.entityId) : undefined,
    v.action ? eq(auditEvents.action, v.action) : undefined,
  );
  const [total] = await deps.db.select({ n: count() }).from(auditEvents).where(where);
  const rows = await deps.db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((v.page - 1) * AUDIT_PAGE_SIZE);
  return { items: rows.map(toAuditEvent), page: v.page, pageSize: AUDIT_PAGE_SIZE, total: total?.n ?? 0 };
}

export async function enqueueResearch(
  deps: CoreDeps,
  actor: Actor,
  i: { state: string; county?: string },
): Promise<void> {
  assertAdmin(actor);
  const parsed = ResearchInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Pick a state", parsed.error.issues);
  const state = USState.safeParse(parsed.data.state.toUpperCase());
  if (!state.success) throw invalidInput("Pick a US state");
  const county = parsed.data.county?.trim() || null;
  await deps.jobs.enqueue("catalog.research", { state: state.data, county });
  await recordAudit(deps, {
    actor,
    action: "research_enqueued",
    entityType: "catalog",
    entityId: state.data,
    meta: { county },
  });
}
