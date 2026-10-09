import {
  type DbOrTx,
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  memoryFacts,
  ne,
  or,
  profiles,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  FactInput,
  FactPatch,
  type FactSource,
  type FactValue,
  type FactVisibility,
  type MemoryFact,
  PROFILE_FACT_KEYS,
  type ProfileFactKey,
  ProfilePatch,
  conflict,
  containsSensitiveTerm,
  invalidInput,
  isSensitiveFactKey,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner, assertSystem, assertUser, familyIdsFor } from "../access";
import { recordAudit } from "../audit";
import {
  type CoreDeps,
  addDays,
  isUniqueConstraint,
  one,
  ownedWhere,
  requireUuid,
  toIso,
  toIsoOrNull,
} from "../shared";

type FactRow = typeof memoryFacts.$inferSelect;
type ProfileSet = Partial<typeof profiles.$inferInsert>;

const CANDIDATE_DAYS = 30;

export function valueText(value: FactValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function toFact(row: FactRow): MemoryFact {
  const value = row.value as FactValue;
  return {
    id: row.id,
    key: row.key,
    value,
    valueText: valueText(value),
    source: row.source,
    sourceRef: row.sourceRef,
    visibility: row.visibility,
    status: row.status,
    createdAt: toIso(row.createdAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    expiresAt: toIsoOrNull(row.expiresAt),
  };
}

function parseFactInput(i: unknown, sensitiveMessage: string): FactInput {
  const parsed = FactInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the fact and try again", parsed.error.issues);
  if (isSensitiveFactKey(parsed.data.key)) throw invalidInput(sensitiveMessage);
  return parsed.data;
}

async function currentFact(db: DbOrTx, ownerId: string, key: string): Promise<FactRow | undefined> {
  const [row] = await db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.key, key),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
      ),
    )
    .orderBy(desc(memoryFacts.createdAt))
    .limit(1);
  return row;
}

/**
 * R2C-2: once a key has a confirmed fact, its live candidates are settled. They point at the
 * confirmed row through supersededById, so listFacts stops showing them.
 */
async function retireCandidates(db: DbOrTx, ownerId: string, key: string, confirmedId: string): Promise<void> {
  await db
    .update(memoryFacts)
    .set({ supersededById: confirmedId })
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.key, key),
        eq(memoryFacts.status, "candidate"),
        isNull(memoryFacts.supersededById),
        ne(memoryFacts.id, confirmedId),
      ),
    );
}

type ProfileColumn = { label: string; field: keyof ProfilePatch; set: (v: unknown) => ProfileSet; clear: ProfileSet };

/** The `profiles` column behind each PROFILE_FACT_KEYS key, validated by the matching ProfilePatch field. */
const PROFILE_COLUMNS: Record<ProfileFactKey, ProfileColumn> = {
  class_year: {
    label: "class year",
    field: "classYear",
    set: (v) => ({ classYear: v as number | null }),
    clear: { classYear: null },
  },
  high_school: {
    label: "high school",
    field: "highSchool",
    set: (v) => ({ highSchool: v as string }),
    clear: { highSchool: "" },
  },
  state: { label: "state", field: "state", set: (v) => ({ state: v as string }), clear: { state: "" } },
  county: { label: "county", field: "county", set: (v) => ({ county: v as string }), clear: { county: "" } },
  city: { label: "city", field: "city", set: (v) => ({ city: v as string }), clear: { city: "" } },
  gpa_unweighted: {
    label: "unweighted GPA",
    field: "gpaUnweighted",
    set: (v) => ({ gpaUnweightedX100: v === null ? null : Math.round((v as number) * 100) }),
    clear: { gpaUnweightedX100: null },
  },
  intended_majors: {
    label: "intended majors",
    field: "intendedMajors",
    set: (v) => ({ intendedMajors: v as string[] }),
    clear: { intendedMajors: [] },
  },
  interests: {
    label: "interests",
    field: "interests",
    set: (v) => ({ interests: v as string[] }),
    clear: { interests: [] },
  },
};

function isProfileFactKey(key: string): key is ProfileFactKey {
  return (PROFILE_FACT_KEYS as readonly string[]).includes(key);
}

/**
 * R2I-1: memory writes on the eight profile keys keep `profiles` in step, in the caller's transaction,
 * so the matcher, the crew port, and autofill see edits and forgets at once. Other keys are ignored.
 * `null` clears the column. A value the column can't hold is invalid_input (the transaction rolls back).
 */
async function syncProfileColumn(tx: DbOrTx, ownerId: string, key: string, value: FactValue | null): Promise<void> {
  if (!isProfileFactKey(key)) return;
  const column = PROFILE_COLUMNS[key];
  let set = column.clear;
  if (value !== null) {
    const parsed = ProfilePatch.shape[column.field].safeParse(value);
    if (!parsed.success || parsed.data === undefined) throw invalidInput(`That value doesn't fit ${column.label}`);
    set = column.set(parsed.data);
  }
  await tx.update(profiles).set(set).where(eq(profiles.userId, ownerId));
}

/**
 * Internal (profile and onboarding use it): writes a confirmed fact and supersedes the current
 * confirmed fact with the same key. The same value and visibility is a no-op. Either way, live
 * candidates for the key are retired (R2C-2). It doesn't touch `profiles`: profile writes set both.
 */
export async function writeConfirmedFact(
  db: DbOrTx,
  ownerId: string,
  f: { key: string; value: FactValue; visibility?: FactVisibility; source: FactSource; sourceRef: string | null },
  now: Date,
): Promise<FactRow> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ownerId}:${f.key}`}))`);
  const current = await currentFact(db, ownerId, f.key);
  const visibility = f.visibility ?? current?.visibility ?? "crew";
  if (current && JSON.stringify(current.value) === JSON.stringify(f.value) && current.visibility === visibility) {
    await retireCandidates(db, ownerId, f.key, current.id);
    return current;
  }
  if (current)
    await db
      .update(memoryFacts)
      .set({ status: "rejected" })
      .where(and(eq(memoryFacts.id, current.id), eq(memoryFacts.ownerId, ownerId), isNull(memoryFacts.supersededById)));
  const created = one(
    await db
      .insert(memoryFacts)
      .values({
        ownerId,
        key: f.key,
        value: f.value,
        source: f.source,
        sourceRef: f.sourceRef,
        visibility,
        status: "confirmed",
        createdAt: now,
        confirmedAt: now,
      })
      .returning(),
    "memory_facts insert",
  );
  if (current)
    await db
      .update(memoryFacts)
      .set({ supersededById: created.id, status: "confirmed" })
      .where(eq(memoryFacts.id, current.id));
  await retireCandidates(db, ownerId, f.key, created.id);
  return created;
}

async function loadFact(deps: CoreDeps, actor: Actor, id: string): Promise<FactRow> {
  requireUuid(id, "Fact not found");
  const [row] = await deps.db.select().from(memoryFacts).where(eq(memoryFacts.id, id)).limit(1);
  if (!row) throw notFound("Fact not found");
  assertOwner(actor, row.ownerId);
  return row;
}

function isLiveCandidate(row: FactRow, now: Date): boolean {
  return row.status === "candidate" && (row.expiresAt === null || row.expiresAt > now);
}

/** Current facts and live candidates. Superseded, rejected, and expired rows are hidden. */
export async function listFacts(deps: CoreDeps, actor: Actor, ownerId: string): Promise<MemoryFact[]> {
  assertOwner(actor, ownerId);
  const now = deps.clock.now();
  const rows = await deps.db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        isNull(memoryFacts.supersededById),
        ne(memoryFacts.status, "rejected"),
        or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, now)),
      ),
    )
    .orderBy(desc(memoryFacts.createdAt));
  return rows.map(toFact);
}

/** The confirmed facts that switch on Prep and Impact (D29, D43); the AddTeammate chips write them. */
export const OPTIONAL_CREW_KEYS = ["crew_prep_enabled", "crew_impact_enabled"] as const;
export type OptionalCrewKey = (typeof OPTIONAL_CREW_KEYS)[number];

/**
 * Which optional teammates a student switched on. The student and members of their family may ask: a parent's
 * sidebar shows the same crew, and the answer is only these two switches, never other facts.
 */
export async function optionalCrewSwitches(deps: CoreDeps, actor: Actor, ownerId: string): Promise<OptionalCrewKey[]> {
  assertUser(actor);
  if (actor.userId !== ownerId) {
    const [mine, theirs] = await Promise.all([familyIdsFor(deps, actor.userId), familyIdsFor(deps, ownerId)]);
    if (!mine.some((id) => theirs.includes(id))) throw notFound();
  }
  const rows = await deps.db
    .select({ key: memoryFacts.key, value: memoryFacts.value })
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        inArray(memoryFacts.key, [...OPTIONAL_CREW_KEYS]),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
      ),
    );
  return OPTIONAL_CREW_KEYS.filter((key) => rows.some((r) => r.key === key && r.value === true));
}

export async function createFact(deps: CoreDeps, actor: Actor, i: FactInput): Promise<MemoryFact> {
  assertUser(actor);
  const input = parseFactInput(i, "Sensitive facts go in matching opt-ins, not memory");
  const ownerId = actor.userId;
  const row = await deps.db
    .transaction(async (tx) => {
      const written = await writeConfirmedFact(
        tx,
        ownerId,
        {
          key: input.key,
          value: input.value,
          visibility: input.visibility,
          source: "user_stated",
          sourceRef: input.sourceRef,
        },
        deps.clock.now(),
      );
      await syncProfileColumn(tx, ownerId, input.key, input.value);
      return written;
    })
    .catch((error: unknown) => {
      if (isUniqueConstraint(error, "memory_facts_current_uq"))
        throw conflict("This fact just changed. Refresh and try again.");
      throw error;
    });
  return toFact(row);
}

export async function updateFact(deps: CoreDeps, actor: Actor, id: string, p: FactPatch): Promise<MemoryFact> {
  assertUser(actor);
  const parsed = FactPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the fact and try again", parsed.error.issues);
  const row = await loadFact(deps, actor, id);
  if (row.status !== "confirmed" || row.supersededById !== null) {
    throw conflict("Only a current confirmed fact can be edited");
  }
  parseFactInput(
    {
      key: row.key,
      value: parsed.data.value ?? row.value,
      visibility: parsed.data.visibility ?? row.visibility,
      sourceRef: row.sourceRef,
    },
    "Sensitive facts go in matching opt-ins, not memory",
  );
  const now = deps.clock.now();
  const next = await deps.db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${row.ownerId}:${row.key}`}))`);
      const claimed = await tx
        .update(memoryFacts)
        .set({ status: "rejected" })
        .where(
          and(
            eq(memoryFacts.id, row.id),
            eq(memoryFacts.ownerId, row.ownerId),
            eq(memoryFacts.status, "confirmed"),
            isNull(memoryFacts.supersededById),
          ),
        )
        .returning();
      if (!claimed.length) throw conflict("This fact just changed. Refresh and try again.");
      const created = one(
        await tx
          .insert(memoryFacts)
          .values({
            ownerId: row.ownerId,
            key: row.key,
            value: parsed.data.value ?? row.value,
            source: "user_stated",
            sourceRef: row.sourceRef,
            visibility: parsed.data.visibility ?? row.visibility,
            status: "confirmed",
            createdAt: now,
            confirmedAt: now,
          })
          .returning(),
        "memory_facts insert",
      );
      await tx
        .update(memoryFacts)
        .set({ supersededById: created.id, status: "confirmed" })
        .where(and(eq(memoryFacts.id, row.id), eq(memoryFacts.ownerId, row.ownerId)));
      await retireCandidates(tx, row.ownerId, row.key, created.id);
      await syncProfileColumn(tx, row.ownerId, row.key, created.value as FactValue);
      return created;
    })
    .catch((error: unknown) => {
      if (isUniqueConstraint(error, "memory_facts_current_uq"))
        throw conflict("This fact just changed. Refresh and try again.");
      throw error;
    });
  return toFact(next);
}

/**
 * Deletes the fact and every older version it superseded. The crew stops seeing it at once. When the
 * forgotten row is the current confirmed fact for a profile key, the profile column is cleared in the
 * same transaction (R2I-1).
 */
export async function forgetFact(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const row = await loadFact(deps, actor, id);
  const ids = [row.id];
  let frontier = [row.id];
  while (frontier.length > 0) {
    const older = await deps.db
      .select({ id: memoryFacts.id })
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, row.ownerId), inArray(memoryFacts.supersededById, frontier)));
    frontier = older.map((r) => r.id).filter((x) => !ids.includes(x));
    ids.push(...frontier);
  }
  const wasCurrent = row.status === "confirmed" && row.supersededById === null;
  await deps.db.transaction(async (tx) => {
    await tx.delete(memoryFacts).where(and(eq(memoryFacts.ownerId, row.ownerId), inArray(memoryFacts.id, ids)));
    if (wasCurrent) await syncProfileColumn(tx, row.ownerId, row.key, null);
  });
  await recordAudit(deps, {
    actor,
    action: "fact_forgotten",
    entityType: "memory_fact",
    entityId: row.id,
    meta: { key: row.key, removed: ids.length },
  });
}

export async function confirmCandidate(deps: CoreDeps, actor: Actor, id: string): Promise<MemoryFact> {
  assertUser(actor);
  const row = await loadFact(deps, actor, id);
  parseFactInput(
    { key: row.key, value: row.value, visibility: row.visibility, sourceRef: row.sourceRef },
    "Sensitive facts go in matching opt-ins, not memory",
  );
  const now = deps.clock.now();
  if (!isLiveCandidate(row, now)) throw notFound("Candidate not found");
  const confirmed = await deps.db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${row.ownerId}:${row.key}`}))`);
      const current = await currentFact(tx, row.ownerId, row.key);
      if (current)
        await tx
          .update(memoryFacts)
          .set({ status: "rejected" })
          .where(
            and(
              eq(memoryFacts.id, current.id),
              eq(memoryFacts.ownerId, row.ownerId),
              isNull(memoryFacts.supersededById),
            ),
          );
      const updated = one(
        await tx
          .update(memoryFacts)
          .set({ status: "confirmed", confirmedAt: now, expiresAt: null })
          .where(
            and(eq(memoryFacts.id, row.id), eq(memoryFacts.ownerId, row.ownerId), eq(memoryFacts.status, "candidate")),
          )
          .returning(),
        "memory_facts update",
      );
      if (current)
        await tx
          .update(memoryFacts)
          .set({ supersededById: row.id, status: "confirmed" })
          .where(and(eq(memoryFacts.id, current.id), eq(memoryFacts.ownerId, row.ownerId)));
      await retireCandidates(tx, row.ownerId, row.key, row.id);
      await syncProfileColumn(tx, row.ownerId, row.key, row.value as FactValue);
      return updated;
    })
    .catch((error: unknown) => {
      if (isUniqueConstraint(error, "memory_facts_current_uq"))
        throw conflict("This fact just changed. Refresh and try again.");
      throw error;
    });
  return toFact(confirmed);
}

export async function rejectCandidate(deps: CoreDeps, actor: Actor, id: string): Promise<MemoryFact> {
  assertUser(actor);
  const row = await loadFact(deps, actor, id);
  if (!isLiveCandidate(row, deps.clock.now())) throw notFound("Candidate not found");
  const updated = one(
    await deps.db.update(memoryFacts).set({ status: "rejected" }).where(eq(memoryFacts.id, row.id)).returning(),
    "memory_facts update",
  );
  return toFact(updated);
}

/**
 * System only (crew jobs). Never for sensitive-looking keys. Expires in 30 days unless confirmed.
 * R2C-15: when the owner already has a current confirmed fact or a live candidate with the same key and
 * value, that row comes back and nothing is inserted, so a retried job files each guess once.
 */
export async function createCandidate(
  deps: CoreDeps,
  system: Actor,
  ownerId: string,
  i: FactInput,
): Promise<MemoryFact> {
  assertSystem(system);
  const input = parseFactInput(i, "Sensitive facts are never inferred");
  if (containsSensitiveTerm(valueText(input.value)))
    throw invalidInput("Sensitive facts go in matching opt-ins, not memory");
  const now = deps.clock.now();
  const same = JSON.stringify(input.value);
  const existing = await deps.db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.key, input.key),
        isNull(memoryFacts.supersededById),
        inArray(memoryFacts.status, ["confirmed", "candidate"]),
        or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, now)),
      ),
    )
    .orderBy(desc(memoryFacts.createdAt));
  const match = existing.find((r) => JSON.stringify(r.value) === same);
  if (match) return toFact(match);
  const row = one(
    await deps.db
      .insert(memoryFacts)
      .values({
        ownerId,
        key: input.key,
        value: input.value,
        source: "crew_inferred",
        sourceRef: input.sourceRef,
        visibility: input.visibility,
        status: "candidate",
        createdAt: now,
        expiresAt: addDays(now, CANDIDATE_DAYS),
      })
      .returning(),
    "memory_facts insert",
  );
  return toFact(row);
}

/** Confirmed current facts the crew may read: crew → crew + crew_family; family → crew_family only. */
export async function crewVisibleFacts(
  deps: CoreDeps,
  system: Actor,
  ownerId: string,
  audience: "crew" | "family",
): Promise<MemoryFact[]> {
  assertSystem(system);
  const visible: FactVisibility[] = audience === "crew" ? ["crew", "crew_family"] : ["crew_family"];
  const rows = await deps.db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
        inArray(memoryFacts.visibility, visible),
      ),
    )
    .orderBy(asc(memoryFacts.key));
  return rows.map(toFact);
}
