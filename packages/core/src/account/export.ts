import {
  actionReceipts,
  activities,
  aidChecklistItems,
  and,
  apiTokens,
  applicationItems,
  collegeList,
  conversations,
  costEstimates,
  crewJobs,
  decisions,
  desc,
  documents,
  eq,
  essayComments,
  essayVersions,
  essays,
  exportsTable,
  familyMembers,
  familyTasks,
  gt,
  helperLinks,
  inArray,
  isNull,
  memoryFacts,
  messages,
  notificationPrefs,
  notifications,
  offerLines,
  offers,
  or,
  planItems,
  profiles,
  recRequests,
  recommenders,
  scholarshipApplications,
  serviceLogs,
  shareSettings,
  sponsorRedemptions,
  sql,
  stories,
  storyUses,
  subscriptions,
  sweepRuns,
  testScores,
  usageCounters,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  type ExportRecord,
  type FactValue,
  SHARE_CATEGORIES,
  notFound,
  userActor,
} from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { getBlob, putBlob } from "../documents";
import { listSensitiveFacts } from "../memory";
import { valueText } from "../memory/facts";
import { notify } from "../notifications";
import { type CoreDeps, addDays, isUuid, one, requireUuid, toIso, toIsoOrNull, todayIn } from "../shared";

type ExportRow = typeof exportsTable.$inferSelect;
type Row = Record<string, unknown>;

/** Columns that never leave the database: token hashes, ciphertext, and internal blob pointers. */
const SECRET_FIELDS = new Set([
  "tokenHash",
  "ciphertext",
  "iv",
  "tag",
  "phoneCiphertext",
  "phoneIv",
  "phoneTag",
  "verificationTokenHash",
  "blobId",
]);

function clean(row: object): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (/hash$/i.test(key) || SECRET_FIELDS.has(key) || Buffer.isBuffer(value)) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

const cleanAll = (rows: object[]): Row[] => rows.map(clean);

function toRecord(row: ExportRow): ExportRecord {
  return {
    id: row.id,
    status: row.status,
    createdAt: toIso(row.createdAt),
    expiresAt: toIsoOrNull(row.expiresAt),
    downloadUrl: row.status === "ready" ? `/api/v1/account/exports/${row.id}` : null,
  };
}

export async function requestExport(deps: CoreDeps, actor: Actor): Promise<ExportRecord> {
  assertUser(actor);
  const { row, created } = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`export:${actor.userId}`}))`);
    const [queued] = await tx
      .select()
      .from(exportsTable)
      .where(and(eq(exportsTable.userId, actor.userId), eq(exportsTable.status, "queued")))
      .limit(1);
    if (queued) return { row: queued, created: false };
    return {
      row: one(
        await tx.insert(exportsTable).values({ userId: actor.userId, createdAt: deps.clock.now() }).returning(),
        "exports insert",
      ),
      created: true,
    };
  });
  // Re-enqueue a reused request too: a previous enqueue may have failed after its row committed.
  await deps.jobs.enqueue("account.export", { exportId: row.id });
  if (created) await recordAudit(deps, { actor, action: "export_requested", entityType: "export", entityId: row.id });
  return toRecord(row);
}

type UserRow = typeof users.$inferSelect;

async function collect(deps: CoreDeps, user: UserRow) {
  const db = deps.db;
  const id = user.id;
  const factRows = await db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, id));
  const storyRows = await db.select().from(stories).where(eq(stories.ownerId, id));
  const essayRows = await db.select().from(essays).where(eq(essays.ownerId, id));
  const activityRows = await db.select().from(activities).where(eq(activities.ownerId, id));
  const conversationRows = await db.select().from(conversations).where(eq(conversations.ownerId, id));
  const offerRows = await db.select().from(offers).where(eq(offers.ownerId, id));
  const documentRows = await db.select().from(documents).where(eq(documents.ownerId, id));
  const essayIds = essayRows.map((r) => r.id);
  const storyIds = storyRows.map((r) => r.id);
  const conversationIds = conversationRows.map((r) => r.id);
  const offerIds = offerRows.map((r) => r.id);
  const versionRows =
    essayIds.length > 0 ? await db.select().from(essayVersions).where(inArray(essayVersions.essayId, essayIds)) : [];
  // R3E-11: the student's sharing choices, and family tasks about them or assigned to them.
  const shareRows = await db.select().from(shareSettings).where(eq(shareSettings.studentId, id));
  const taskRows = await db
    .select({ task: familyTasks, itemStatus: aidChecklistItems.status })
    .from(familyTasks)
    .leftJoin(aidChecklistItems, eq(aidChecklistItems.id, familyTasks.aidItemId))
    .where(or(eq(familyTasks.studentId, id), eq(familyTasks.assigneeId, id)));
  const data: Record<string, unknown> = {
    user: clean(user),
    profile: cleanAll(await db.select().from(profiles).where(eq(profiles.userId, id))),
    memoryFacts: cleanAll(factRows),
    sensitiveFacts: await listSensitiveFacts(deps, userActor(id, user.role)),
    decisions: cleanAll(await db.select().from(decisions).where(eq(decisions.ownerId, id))),
    stories: cleanAll(storyRows),
    storyUses: cleanAll(
      storyIds.length > 0 ? await db.select().from(storyUses).where(inArray(storyUses.storyId, storyIds)) : [],
    ),
    collegeList: cleanAll(await db.select().from(collegeList).where(eq(collegeList.ownerId, id))),
    applicationItems: cleanAll(await db.select().from(applicationItems).where(eq(applicationItems.ownerId, id))),
    recommenders: cleanAll(await db.select().from(recommenders).where(eq(recommenders.ownerId, id))),
    recRequests: cleanAll(await db.select().from(recRequests).where(eq(recRequests.ownerId, id))),
    scholarshipApplications: cleanAll(
      await db.select().from(scholarshipApplications).where(eq(scholarshipApplications.ownerId, id)),
    ),
    essays: cleanAll(essayRows),
    essayVersions: cleanAll(versionRows),
    essayComments: cleanAll(
      essayIds.length > 0 ? await db.select().from(essayComments).where(inArray(essayComments.essayId, essayIds)) : [],
    ),
    testScores: cleanAll(await db.select().from(testScores).where(eq(testScores.ownerId, id))),
    activities: cleanAll(activityRows),
    serviceLogs: cleanAll(await db.select().from(serviceLogs).where(eq(serviceLogs.ownerId, id))),
    costEstimates: cleanAll(await db.select().from(costEstimates).where(eq(costEstimates.ownerId, id))),
    documents: cleanAll(documentRows),
    offers: cleanAll(offerRows),
    offerLines: cleanAll(
      offerIds.length > 0 ? await db.select().from(offerLines).where(inArray(offerLines.offerId, offerIds)) : [],
    ),
    aidChecklistItems: cleanAll(await db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, id))),
    sweepRuns: cleanAll(await db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, id))),
    planItems: cleanAll(await db.select().from(planItems).where(eq(planItems.ownerId, id))),
    conversations: cleanAll(conversationRows),
    messages: cleanAll(
      conversationIds.length > 0
        ? await db.select().from(messages).where(inArray(messages.conversationId, conversationIds))
        : [],
    ),
    crewJobs: cleanAll(await db.select().from(crewJobs).where(eq(crewJobs.ownerId, id))),
    actionReceipts: cleanAll(await db.select().from(actionReceipts).where(eq(actionReceipts.ownerId, id))),
    notifications: cleanAll(await db.select().from(notifications).where(eq(notifications.userId, id))),
    notificationPrefs: cleanAll(await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, id))),
    subscriptions: cleanAll(await db.select().from(subscriptions).where(eq(subscriptions.ownerId, id))),
    usageCounters: cleanAll(await db.select().from(usageCounters).where(eq(usageCounters.userId, id))),
    helperLinks: cleanAll(await db.select().from(helperLinks).where(eq(helperLinks.studentId, id))),
    apiTokens: cleanAll(await db.select().from(apiTokens).where(eq(apiTokens.userId, id))),
    familyMembers: cleanAll(await db.select().from(familyMembers).where(eq(familyMembers.userId, id))),
    shareSettings: cleanAll(shareRows),
    familyTasks: cleanAll(taskRows.map((r) => r.task)),
    sponsorRedemptions: cleanAll(await db.select().from(sponsorRedemptions).where(eq(sponsorRedemptions.userId, id))),
  };
  return { data, factRows, storyRows, essayRows, versionRows, activityRows, documentRows, shareRows, taskRows };
}

function renderMarkdown(user: UserRow, generatedAt: string, c: Awaited<ReturnType<typeof collect>>): string {
  const lines: string[] = [
    `# ScholarCrew export for ${user.displayName || user.email}`,
    "",
    `Generated ${generatedAt}`,
  ];
  const facts = c.factRows.filter((f) => f.status === "confirmed" && f.supersededById === null);
  lines.push("", "## Profile facts", "");
  if (facts.length === 0) lines.push("None yet.");
  for (const f of facts) {
    // The export keeps ISO dates (it's a record and needs the year), on the student's calendar (R3E-8).
    lines.push(`- ${f.key}: ${valueText(f.value as FactValue)} (${f.source}, ${todayIn(f.createdAt, user.timeZone)})`);
  }
  lines.push("", "## Stories", "");
  if (c.storyRows.length === 0) lines.push("None yet.");
  for (const s of c.storyRows) {
    lines.push(`### ${s.title}`, "", s.moment);
    if (s.themes.length > 0) lines.push("", `Themes: ${s.themes.join(", ")}`);
    if (s.evidence) lines.push("", `Evidence: ${s.evidence}`);
    lines.push("");
  }
  lines.push("", "## Essays", "");
  if (c.essayRows.length === 0) lines.push("None yet.");
  for (const e of c.essayRows) {
    const latest = c.versionRows.filter((v) => v.essayId === e.id).sort((a, b) => b.version - a.version)[0];
    lines.push(`### ${e.title}`, "", `Prompt: ${e.prompt}`, "");
    if (latest) lines.push(`Version ${latest.version}, ${latest.wordCount} words:`, "", latest.body, "");
    else lines.push("No draft saved yet.", "");
  }
  lines.push("", "## Activities", "");
  if (c.activityRows.length === 0) lines.push("None yet.");
  for (const a of [...c.activityRows].sort((x, y) => x.position - y.position)) {
    const where = [a.role, a.organization].filter((s) => s.length > 0).join(", ");
    const detail = a.description ? `: ${a.description}` : "";
    lines.push(
      `${a.position}. ${a.name}${where ? ` (${where})` : ""}${detail} [${a.hoursPerWeek} h/week, ${a.weeksPerYear} weeks/year]`,
    );
  }
  lines.push("", "## Sharing with family", "");
  if (c.shareRows.length === 0) lines.push("None yet.");
  const shareOrder = (r: (typeof c.shareRows)[number]) => SHARE_CATEGORIES.indexOf(r.category);
  for (const r of [...c.shareRows].sort((x, y) => shareOrder(x) - shareOrder(y))) {
    lines.push(`- ${r.category}: ${r.enabled ? "on" : "off"}`);
  }
  lines.push("", "## Family tasks", "");
  if (c.taskRows.length === 0) lines.push("None yet.");
  for (const r of [...c.taskRows].sort((x, y) => x.task.createdAt.getTime() - y.task.createdAt.getTime())) {
    // An aid-linked task's status lives on its aid checklist item (R2I-6).
    lines.push(`- ${r.task.title} (${r.itemStatus ?? r.task.status})`);
  }
  // R2I-18: file bytes stay out of the export (one blob, up to 10 MB per file); the list says where they are.
  lines.push("", "## Files you uploaded", "");
  if (c.documentRows.length === 0) lines.push("None yet.");
  for (const d of [...c.documentRows].sort((x, y) => x.uploadedAt.getTime() - y.uploadedAt.getTime())) {
    lines.push(`- ${d.filename} (${d.kind}, ${d.sizeBytes} bytes)`);
  }
  if (c.documentRows.length > 0) lines.push("", "Download these from Settings → Documents.");
  return `${lines.join("\n").trimEnd()}\n`;
}

/** System only (account.export job). One encrypted blob, ready for 24 hours. Notifies the owner once (R2I-18). */
export async function buildExport(
  deps: CoreDeps,
  system: Actor,
  exportId: string,
  o: { lastAttempt: boolean },
): Promise<void> {
  assertSystem(system);
  if (!isUuid(exportId)) return;
  let ready: ExportRow | null = null;
  try {
    ready = await deps.db.transaction(async (tx) => {
      const [row] = await tx.select().from(exportsTable).where(eq(exportsTable.id, exportId)).for("update");
      if (!row || row.status === "failed") return null;
      if (row.status === "ready") return row.expiresAt && row.expiresAt > deps.clock.now() ? row : null;
      const [user] = await tx.select().from(users).where(eq(users.id, row.userId));
      if (!user || user.status !== "active") {
        await tx.update(exportsTable).set({ status: "failed" }).where(eq(exportsTable.id, exportId));
        return null;
      }
      const local = { ...deps, db: tx as CoreDeps["db"] };
      const now = deps.clock.now();
      const generatedAt = toIso(now);
      const collected = await collect(local, user);
      const file = { generatedAt, data: collected.data, markdown: renderMarkdown(user, generatedAt, collected) };
      const blobId = await putBlob(local, Buffer.from(JSON.stringify(file), "utf8"));
      const completed = one(
        await tx
          .update(exportsTable)
          .set({ status: "ready", blobId, expiresAt: addDays(now, 1) })
          .where(eq(exportsTable.id, exportId))
          .returning(),
        "export ready",
      );
      await recordAudit(local, { actor: system, action: "export_ready", entityType: "export", entityId: exportId });
      return completed;
    });
  } catch (error) {
    if (o.lastAttempt) {
      const [failed] = await deps.db
        .update(exportsTable)
        .set({ status: "failed", expiresAt: addDays(deps.clock.now(), 1) })
        .where(and(eq(exportsTable.id, exportId), eq(exportsTable.status, "queued")))
        .returning();
      if (failed)
        await notify(deps, system, {
          userId: failed.userId,
          kind: "system",
          title: "Your export didn't finish",
          body: "Your export didn't finish. Request a new one from Settings.",
          link: "/settings#data",
          dedupeKey: `export-failed:${exportId}`,
        });
    }
    throw error;
  }
  // A ready retry replays this idempotent notification; notification failure never downgrades the export.
  if (ready)
    await notify(deps, system, {
      userId: ready.userId,
      kind: "system",
      title: "Your export is ready",
      body: "It's ready to download for 24 hours.",
      link: "/settings#data",
      dedupeKey: `export:${exportId}`,
      email: true,
    });
}

export async function getExport(
  deps: CoreDeps,
  actor: Actor,
  id: string,
): Promise<{ record: ExportRecord; bytes: Buffer | null }> {
  assertUser(actor);
  requireUuid(id, "Export not found");
  const [row] = await deps.db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.id, id), eq(exportsTable.userId, actor.userId)));
  if (!row) throw notFound("Export not found");
  if (row.expiresAt && row.expiresAt <= deps.clock.now()) throw notFound("This export has expired");
  const bytes = row.status === "ready" && row.blobId ? await getBlob(deps, row.blobId) : null;
  return { record: toRecord(row), bytes };
}

/** The actor's newest export that hasn't expired (any status), or null. Settings shows it. */
export async function latestExport(deps: CoreDeps, actor: Actor): Promise<ExportRecord | null> {
  assertUser(actor);
  const [row] = await deps.db
    .select()
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.userId, actor.userId),
        or(isNull(exportsTable.expiresAt), gt(exportsTable.expiresAt, deps.clock.now())),
      ),
    )
    .orderBy(desc(exportsTable.createdAt))
    .limit(1);
  return row ? toRecord(row) : null;
}
