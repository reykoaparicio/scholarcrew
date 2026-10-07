import type { Keyring } from "../crypto";

import {
  type DbOrTx,
  and,
  eq,
  familyMembers,
  familyTasks,
  isNotNull,
  isNull,
  or,
  sensitiveFacts,
} from "@scholarcrew/db";
import {
  type Actor,
  INCOME_RANGE_LABELS,
  IncomeRange,
  NO_SENSITIVE,
  SENSITIVE_KINDS,
  SensitiveFactInput,
  type SensitiveFactSummary,
  type SensitiveFactValues,
  type SensitiveKind,
  ShareIncomeInput,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { decryptJson, encryptJson } from "../crypto";
import type { CoreDeps } from "../shared";

type SensitiveRow = typeof sensitiveFacts.$inferSelect;
type StoredValue = string | string[];

const VALUE_KINDS: SensitiveKind[] = ["income_range", "heritage", "religion"];

/**
 * Internal (onboarding uses it): upserts one sensitive fact. A new value is encrypted; yes/no kinds
 * never store one; a valued kind toggled without a value keeps its stored value.
 */
export async function writeSensitiveFact(
  db: DbOrTx,
  key: Keyring,
  ownerId: string,
  input: SensitiveFactInput,
  sharedByUserId: string | null,
  now: Date,
): Promise<void> {
  if (input.value !== null) {
    const sealed = encryptJson(key, input.value);
    const set = {
      enabled: input.enabled,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      tag: sealed.tag,
      keyId: sealed.keyId,
      sharedByUserId,
      updatedAt: now,
    };
    await db
      .insert(sensitiveFacts)
      .values({ ownerId, kind: input.kind, ...set })
      .onConflictDoUpdate({ target: [sensitiveFacts.ownerId, sensitiveFacts.kind], set });
    return;
  }
  if (!VALUE_KINDS.includes(input.kind)) {
    const set = { enabled: input.enabled, ciphertext: null, iv: null, tag: null, sharedByUserId: null, updatedAt: now };
    await db
      .insert(sensitiveFacts)
      .values({ ownerId, kind: input.kind, ...set })
      .onConflictDoUpdate({ target: [sensitiveFacts.ownerId, sensitiveFacts.kind], set });
    return;
  }
  await db
    .insert(sensitiveFacts)
    .values({ ownerId, kind: input.kind, enabled: input.enabled, updatedAt: now })
    .onConflictDoUpdate({
      target: [sensitiveFacts.ownerId, sensitiveFacts.kind],
      set: { enabled: input.enabled, updatedAt: now },
    });
}

function readValue(key: Keyring, row: SensitiveRow): StoredValue | null {
  if (!row.ciphertext || !row.iv || !row.tag) return null;
  return decryptJson<StoredValue>(key, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyId: row.keyId });
}

function displayValue(value: StoredValue): string {
  if (Array.isArray(value)) return value.join(", ");
  const range = IncomeRange.safeParse(value);
  return range.success ? INCOME_RANGE_LABELS[range.data] : value;
}

function summarize(key: Keyring, kind: SensitiveKind, row: SensitiveRow | undefined): SensitiveFactSummary {
  if (!row) return { kind, enabled: false, hasValue: false, displayValue: null, sharedByParent: false };
  const value = readValue(key, row);
  return {
    kind,
    enabled: row.enabled,
    hasValue: value !== null,
    displayValue: value === null ? null : displayValue(value),
    sharedByParent: row.sharedByUserId !== null,
  };
}

async function rowsFor(db: DbOrTx, ownerId: string): Promise<SensitiveRow[]> {
  return db.select().from(sensitiveFacts).where(eq(sensitiveFacts.ownerId, ownerId));
}

/** Owner-only summaries for all eight kinds. */
export async function listSensitiveFacts(deps: CoreDeps, actor: Actor): Promise<SensitiveFactSummary[]> {
  assertUser(actor);
  const rows = await rowsFor(deps.db, actor.userId);
  return SENSITIVE_KINDS.map((kind) =>
    summarize(
      deps.config.keyring,
      kind,
      rows.find((r) => r.kind === kind),
    ),
  );
}

export async function setSensitiveFact(
  deps: CoreDeps,
  actor: Actor,
  i: SensitiveFactInput,
): Promise<SensitiveFactSummary> {
  assertUser(actor);
  const parsed = SensitiveFactInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the matching fact and try again", parsed.error.issues);
  await writeSensitiveFact(deps.db, deps.config.keyring, actor.userId, parsed.data, null, deps.clock.now());
  await recordAudit(deps, {
    actor,
    action: "sensitive_facts_changed",
    entityType: "user",
    entityId: actor.userId,
    meta: {},
  });
  const rows = await rowsFor(deps.db, actor.userId);
  return summarize(
    deps.config.keyring,
    parsed.data.kind,
    rows.find((r) => r.kind === parsed.data.kind),
  );
}

function listOf(value: StoredValue | null): string[] {
  return Array.isArray(value) ? value : [];
}

/** System only. Disabled kinds read as false / null / []. The result goes to the matcher, never to a model. */
export async function readSensitiveForMatcher(
  deps: CoreDeps,
  system: Actor,
  ownerId: string,
): Promise<SensitiveFactValues> {
  assertSystem(system);
  const out: SensitiveFactValues = { ...NO_SENSITIVE, heritage: [], religion: [] };
  for (const row of await rowsFor(deps.db, ownerId)) {
    if (!row.enabled) continue;
    const value = readValue(deps.config.keyring, row);
    switch (row.kind) {
      case "first_gen":
        out.firstGen = true;
        break;
      case "income_range": {
        const range = IncomeRange.safeParse(value);
        out.incomeRange = range.success ? range.data : null;
        break;
      }
      case "heritage":
        out.heritage = listOf(value);
        break;
      case "religion":
        out.religion = listOf(value);
        break;
      case "disability":
        out.disability = true;
        break;
      case "military_family":
        out.militaryFamily = true;
        break;
      case "foster_care":
        out.fosterCare = true;
        break;
      case "noncitizen_filter":
        out.noncitizenFilter = true;
        break;
    }
  }
  return out;
}

async function offerIncomeRange(
  tx: DbOrTx,
  key: Keyring,
  studentId: string,
  range: IncomeRange,
  parentId: string,
  now: Date,
): Promise<void> {
  const sealed = encryptJson(key, range);
  await tx
    .insert(sensitiveFacts)
    .values({
      ownerId: studentId,
      kind: "income_range",
      enabled: false,
      ...sealed,
      sharedByUserId: parentId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sensitiveFacts.ownerId, sensitiveFacts.kind],
      set: { ...sealed, sharedByUserId: parentId, updatedAt: now },
      setWhere: or(isNotNull(sensitiveFacts.sharedByUserId), isNull(sensitiveFacts.ciphertext)),
    });
}

/** A parent shares an income range into a student's matching. Both must be in the same family. */
export async function shareIncomeRangeToStudent(
  deps: CoreDeps,
  actor: Actor,
  i: { studentId: string; range: IncomeRange },
): Promise<void> {
  assertUser(actor);
  const parsed = ShareIncomeInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Choose an income range", parsed.error.issues);
  const { studentId, range } = parsed.data;
  const mine = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, actor.userId), eq(familyMembers.memberRole, "parent")));
  const theirs = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, studentId), eq(familyMembers.memberRole, "student")));
  const familyId = theirs.map((r) => r.familyId).find((id) => mine.some((m) => m.familyId === id));
  if (!familyId) throw notFound("Student not found");
  const now = deps.clock.now();
  const parentId = actor.userId;
  await deps.db.transaction(async (tx) => {
    await offerIncomeRange(tx, deps.config.keyring, studentId, range, parentId, now);
    await tx
      .update(familyTasks)
      .set({ status: "done", completedAt: now })
      .where(
        and(
          eq(familyTasks.familyId, familyId),
          eq(familyTasks.studentId, studentId),
          eq(familyTasks.assigneeId, parentId),
          eq(familyTasks.kind, "share_income_range"),
          eq(familyTasks.status, "todo"),
        ),
      );
  });
  await recordAudit(deps, {
    actor,
    action: "sensitive_facts_changed",
    entityType: "user",
    entityId: studentId,
    meta: {},
  });
}
