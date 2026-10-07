import {
  type DbOrTx,
  aidChecklistItems,
  and,
  asc,
  colleges,
  eq,
  familyBudgets,
  familyMembers,
  familyTasks,
  shareSettings,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  DEFAULT_SHARED,
  type FamilyBudget,
  FamilyBudgetInput,
  type FamilyTask,
  type FamilyTaskKind,
  FamilyTaskPatch,
  SHARE_CATEGORIES,
  type ShareCategory,
  type ShareSettings,
  ShareSettingsInput,
  forbidden,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertSystem, assertUser, familyIdsFor, getShareGrants } from "../access";
import { recordAudit } from "../audit";
import { type CoreDeps, isUuid, one, ownedWhere, requireUuid, toIso, toIsoOrNull } from "../shared";
import { type FamilyTaskRow, insertFamilyTask, membershipOf, unnamedInviter } from "./core";

type TaskRow = FamilyTaskRow;

async function readShareSettings(db: DbOrTx, studentId: string, familyId: string): Promise<ShareSettings> {
  const rows = await db
    .select()
    .from(shareSettings)
    .where(and(eq(shareSettings.studentId, studentId), eq(shareSettings.familyId, familyId)));
  const categories = Object.fromEntries(
    SHARE_CATEGORIES.map((c) => [c, rows.find((r) => r.category === c)?.enabled ?? DEFAULT_SHARED[c]]),
  ) as Record<ShareCategory, boolean>;
  return { studentId, familyId, categories };
}

/** Any member of the student's family reads them. */
export async function getShareSettings(deps: CoreDeps, actor: Actor, studentId: string): Promise<ShareSettings> {
  assertUser(actor);
  requireUuid(studentId, "Share settings not found");
  const studentFamilies = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, studentId), eq(familyMembers.memberRole, "student")));
  const mine = await familyIdsFor(deps, actor.userId);
  const familyId = studentFamilies.map((r) => r.familyId).find((id) => mine.includes(id));
  if (!familyId) throw notFound("Share settings not found");
  return readShareSettings(deps.db, studentId, familyId);
}

/** The student edits their own settings. */
export async function updateShareSettings(deps: CoreDeps, actor: Actor, i: ShareSettingsInput): Promise<ShareSettings> {
  assertUser(actor);
  const parsed = ShareSettingsInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the share settings", parsed.error.issues);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership || membership.memberRole !== "student") throw notFound("Share settings not found");
  const studentId = actor.userId;
  const changes = SHARE_CATEGORIES.filter((c) => parsed.data.categories[c] !== undefined);
  for (const category of changes) {
    const enabled = parsed.data.categories[category] === true;
    await deps.db
      .insert(shareSettings)
      .values({ studentId, familyId: membership.familyId, category, enabled })
      .onConflictDoUpdate({
        target: [shareSettings.studentId, shareSettings.familyId, shareSettings.category],
        set: { enabled },
      });
  }
  await recordAudit(deps, {
    actor,
    action: "share_settings_updated",
    entityType: "family",
    entityId: membership.familyId,
    meta: { categories: parsed.data.categories },
  });
  return readShareSettings(deps.db, studentId, membership.familyId);
}

function toBudget(row: typeof familyBudgets.$inferSelect): FamilyBudget {
  return {
    familyId: row.familyId,
    annualUsd: row.annualUsd,
    sharedById: row.sharedById,
    updatedAt: toIso(row.updatedAt),
  };
}

export async function getBudget(deps: CoreDeps, actor: Actor): Promise<FamilyBudget | null> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) return null;
  const [row] = await deps.db.select().from(familyBudgets).where(eq(familyBudgets.familyId, membership.familyId));
  return row ? toBudget(row) : null;
}

/** Parents share a yearly budget. Completes the parent's open share_budget tasks. */
export async function setBudget(deps: CoreDeps, actor: Actor, i: FamilyBudgetInput): Promise<FamilyBudget> {
  assertUser(actor);
  const parsed = FamilyBudgetInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Enter a yearly amount in whole dollars", parsed.error.issues);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) throw notFound("You're not in a family");
  if (membership.memberRole !== "parent") throw forbidden("Only a parent can share the family budget");
  const now = deps.clock.now();
  const set = { annualUsd: parsed.data.annualUsd, sharedById: actor.userId, updatedAt: now };
  const row = one(
    await deps.db
      .insert(familyBudgets)
      .values({ familyId: membership.familyId, ...set })
      .onConflictDoUpdate({ target: familyBudgets.familyId, set })
      .returning(),
    "family_budgets upsert",
  );
  await deps.db
    .update(familyTasks)
    .set({ status: "done", completedAt: now })
    .where(
      and(
        eq(familyTasks.familyId, membership.familyId),
        eq(familyTasks.assigneeId, actor.userId),
        eq(familyTasks.kind, "share_budget"),
        eq(familyTasks.status, "todo"),
      ),
    );
  await recordAudit(deps, {
    actor,
    action: "family_budget_shared",
    entityType: "family",
    entityId: membership.familyId,
  });
  return toBudget(row);
}

/** The aid checklist item behind an aid-linked task. Its status is the task's status (R2I-6). */
type LinkedItem = { status: TaskRow["status"]; completedAt: Date | null };

function toTask(row: TaskRow, assigneeName: string, item: LinkedItem | null = null, title = row.title): FamilyTask {
  return {
    id: row.id,
    familyId: row.familyId,
    assigneeId: row.assigneeId,
    assigneeName,
    studentId: row.studentId,
    kind: row.kind,
    title,
    detail: row.detail,
    status: item ? item.status : row.status,
    dueOn: row.dueOn,
    createdAt: toIso(row.createdAt),
    completedAt: toIsoOrNull(item ? item.completedAt : row.completedAt),
  };
}

/** Tasks with their assignee name, linked aid item, and that item's college. */
function taskQuery(db: DbOrTx) {
  return db
    .select({
      task: familyTasks,
      assigneeDisplayName: users.displayName,
      assigneeRole: users.role,
      itemStatus: aidChecklistItems.status,
      itemCompletedAt: aidChecklistItems.completedAt,
      collegeName: colleges.name,
    })
    .from(familyTasks)
    .innerJoin(users, eq(users.id, familyTasks.assigneeId))
    .leftJoin(aidChecklistItems, eq(aidChecklistItems.id, familyTasks.aidItemId))
    .leftJoin(colleges, eq(colleges.id, aidChecklistItems.collegeId));
}

type TaskJoin = Awaited<ReturnType<typeof taskQuery>>[number];

/** R3V-14: a parent who joined from an invite may have no name yet; never show an empty tag. */
function assigneeNameOf(r: TaskJoin): string {
  return r.assigneeDisplayName.trim() || unnamedInviter(r.assigneeRole);
}

function linkedOf(r: TaskJoin): LinkedItem | null {
  return r.task.aidItemId !== null && r.itemStatus !== null
    ? { status: r.itemStatus, completedAt: r.itemCompletedAt }
    : null;
}

/**
 * R2I-5: CSS tasks store the plain step title. The college name is added at read time, only for the
 * task's student or a viewer whose share grants include `colleges`.
 */
async function presentTasks(deps: CoreDeps, viewerId: string, rows: TaskJoin[]): Promise<FamilyTask[]> {
  const grants = new Map<string, boolean>();
  const mayReadColleges = async (studentId: string): Promise<boolean> => {
    if (studentId === viewerId) return true;
    const known = grants.get(studentId);
    if (known !== undefined) return known;
    const allowed = (await getShareGrants(deps, studentId, viewerId)).includes("colleges");
    grants.set(studentId, allowed);
    return allowed;
  };
  const out: FamilyTask[] = [];
  for (const r of rows) {
    const named =
      r.task.kind === "css_contributor" && r.collegeName !== null && (await mayReadColleges(r.task.studentId))
        ? `${r.task.title} (${r.collegeName})`
        : r.task.title;
    out.push(toTask(r.task, assigneeNameOf(r), linkedOf(r), named));
  }
  return out;
}

export async function listTasks(deps: CoreDeps, actor: Actor): Promise<FamilyTask[]> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) return [];
  const rows = await taskQuery(deps.db)
    .where(eq(familyTasks.familyId, membership.familyId))
    .orderBy(asc(familyTasks.createdAt), asc(familyTasks.id));
  return presentTasks(deps, actor.userId, rows);
}

/**
 * The assignee or the task's student changes its status. An aid-linked task writes its aid checklist
 * item instead of the task row, so /money and /family show one status (R2I-6).
 */
export async function updateTask(deps: CoreDeps, actor: Actor, id: string, p: FamilyTaskPatch): Promise<FamilyTask> {
  assertUser(actor);
  requireUuid(id, "Task not found");
  const parsed = FamilyTaskPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Choose a task status", parsed.error.issues);
  const [task] = await deps.db.select().from(familyTasks).where(eq(familyTasks.id, id));
  const membership = await membershipOf(deps.db, actor.userId);
  const allowed =
    task !== undefined &&
    membership?.familyId === task.familyId &&
    (task.assigneeId === actor.userId || task.studentId === actor.userId);
  if (!task || !allowed) throw notFound("Task not found");
  const set = { status: parsed.data.status, completedAt: parsed.data.status === "done" ? deps.clock.now() : null };
  if (task.aidItemId !== null) {
    await deps.db.update(aidChecklistItems).set(set).where(eq(aidChecklistItems.id, task.aidItemId));
  } else {
    await deps.db.update(familyTasks).set(set).where(eq(familyTasks.id, id));
  }
  const rows = await taskQuery(deps.db).where(eq(familyTasks.id, id));
  return one(await presentTasks(deps, actor.userId, rows), "family_tasks select");
}

/**
 * System only (aid checklists, offer confirmations). The assignee must be in the family. With an
 * `aidItemId`, a second call for the same item and assignee returns the existing task (R2I-6).
 * A new task notifies the assignee (R2I-15).
 */
export async function createTask(
  deps: CoreDeps,
  system: Actor,
  i: {
    familyId: string;
    assigneeId: string;
    studentId: string;
    kind: FamilyTaskKind;
    title: string;
    detail?: string;
    dueOn?: string | null;
    aidItemId?: string | null;
  },
): Promise<FamilyTask> {
  assertSystem(system);
  if (i.aidItemId != null && !isUuid(i.aidItemId)) throw invalidInput("Unknown aid checklist item");
  const [member] = await deps.db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, i.familyId), eq(familyMembers.userId, i.assigneeId)));
  if (!member) throw invalidInput("The assignee isn't in that family");
  const { row } = await insertFamilyTask(deps.db, i, deps.clock.now());
  const joined = one(await taskQuery(deps.db).where(eq(familyTasks.id, row.id)), "family_tasks select");
  return toTask(joined.task, assigneeNameOf(joined), linkedOf(joined));
}
