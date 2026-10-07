import { aidDeadlines, aidRules, asc, eq } from "@scholarcrew/db";
import {
  type Actor,
  type AidDeadline,
  AidDeadlineInput,
  type AidRule,
  AidRuleInput,
  AidRuleKey,
  AppError,
  AwardYear,
  FederalLoanRates,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertAdmin } from "../access";
import { toAidDeadline } from "../aid/checklists";
import { recordAudit } from "../audit";
import { type CoreDeps, one, requireUuid, toIso } from "../shared";

type RuleRow = typeof aidRules.$inferSelect;

/** Null for a stored row whose key or value doesn't parse, so one bad row can't break the page. */
function toAidRule(row: RuleRow): AidRule | null {
  const key = AidRuleKey.safeParse(row.key);
  const value = FederalLoanRates.safeParse(row.value);
  if (!key.success || !value.success) return null;
  return {
    id: row.id,
    awardYear: row.awardYear,
    key: key.data,
    value: value.data,
    sourceUrl: row.sourceUrl,
    verifiedAt: toIso(row.verifiedAt),
  };
}

function awardYearOf(f: { awardYear?: string }): string | undefined {
  if (f.awardYear === undefined || f.awardYear === "") return undefined;
  if (!AwardYear.safeParse(f.awardYear).success) throw invalidInput("Use a YYYY-YY award year");
  return f.awardYear;
}

export async function listAidRules(deps: CoreDeps, actor: Actor, f: { awardYear?: string } = {}): Promise<AidRule[]> {
  assertAdmin(actor);
  const awardYear = awardYearOf(f);
  const rows = await deps.db
    .select()
    .from(aidRules)
    .where(awardYear ? eq(aidRules.awardYear, awardYear) : undefined)
    .orderBy(asc(aidRules.awardYear), asc(aidRules.key));
  return rows.flatMap((r) => {
    const rule = toAidRule(r);
    return rule ? [rule] : [];
  });
}

/** Upserts on (awardYear, key) and stamps `verifiedAt` now; the admin just checked the source. */
export async function upsertAidRule(deps: CoreDeps, actor: Actor, i: AidRuleInput): Promise<AidRule> {
  assertAdmin(actor);
  const parsed = AidRuleInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the loan rates and try again", parsed.error.issues);
  const v = parsed.data;
  const now = deps.clock.now();
  const row = one(
    await deps.db
      .insert(aidRules)
      .values({ awardYear: v.awardYear, key: v.key, value: v.value, sourceUrl: v.sourceUrl, verifiedAt: now })
      .onConflictDoUpdate({
        target: [aidRules.awardYear, aidRules.key],
        set: { value: v.value, sourceUrl: v.sourceUrl, verifiedAt: now },
      })
      .returning(),
    "aid_rules upsert",
  );
  await recordAudit(deps, {
    actor,
    action: "aid_rule_upserted",
    entityType: "aid_rule",
    entityId: row.id,
    meta: { awardYear: v.awardYear, key: v.key },
  });
  const rule = toAidRule(row);
  if (!rule) throw new AppError("internal", "Aid rule unreadable after save");
  return rule;
}

export async function listAidDeadlinesForAdmin(
  deps: CoreDeps,
  actor: Actor,
  f: { awardYear?: string } = {},
): Promise<AidDeadline[]> {
  assertAdmin(actor);
  const awardYear = awardYearOf(f);
  const rows = await deps.db
    .select()
    .from(aidDeadlines)
    .where(awardYear ? eq(aidDeadlines.awardYear, awardYear) : undefined)
    .orderBy(asc(aidDeadlines.awardYear), asc(aidDeadlines.deadline), asc(aidDeadlines.program));
  return rows.map(toAidDeadline);
}

/** Inserts when `id` is missing, updates otherwise (unknown id is `not_found`). `verifiedAt` is now either way. */
export async function upsertAidDeadline(deps: CoreDeps, actor: Actor, i: AidDeadlineInput): Promise<AidDeadline> {
  assertAdmin(actor);
  const parsed = AidDeadlineInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the deadline and try again", parsed.error.issues);
  const { id, ...v } = parsed.data;
  const values = { ...v, verifiedAt: deps.clock.now() };
  let row: typeof aidDeadlines.$inferSelect;
  if (id === undefined) {
    row = one(await deps.db.insert(aidDeadlines).values(values).returning(), "aid_deadlines insert");
  } else {
    const [updated] = await deps.db.update(aidDeadlines).set(values).where(eq(aidDeadlines.id, id)).returning();
    if (!updated) throw notFound("Aid deadline not found");
    row = updated;
  }
  await recordAudit(deps, {
    actor,
    action: "aid_deadline_upserted",
    entityType: "aid_deadline",
    entityId: row.id,
    meta: { awardYear: row.awardYear, state: row.state, program: row.program },
  });
  return toAidDeadline(row);
}

export async function deleteAidDeadline(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  requireUuid(id, "Aid deadline not found");
  const deleted = await deps.db.delete(aidDeadlines).where(eq(aidDeadlines.id, id)).returning({ id: aidDeadlines.id });
  if (deleted.length === 0) throw notFound("Aid deadline not found");
  await recordAudit(deps, { actor, action: "aid_deadline_deleted", entityType: "aid_deadline", entityId: id });
}
