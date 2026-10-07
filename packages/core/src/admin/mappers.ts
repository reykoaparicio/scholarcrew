import type { auditEvents, catalogReports, catalogTasks, scholarships } from "@scholarcrew/db";
import type { AuditEvent, CatalogReport, CatalogTask, Scholarship } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export function toScholarship(row: typeof scholarships.$inferSelect): Scholarship {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    url: row.url,
    sourceUrl: row.sourceUrl,
    amountMinUsd: row.amountMinUsd,
    amountMaxUsd: row.amountMaxUsd,
    renewable: row.renewable,
    renewalTerms: row.renewalTerms,
    deadline: row.deadline,
    cycle: row.cycle,
    localArea: row.localArea,
    eligibility: row.eligibility,
    requirements: row.requirements,
    status: row.status,
    visibility: row.visibility,
    submittedById: row.submittedById,
    scamFlags: row.scamFlags,
    estMinutes: row.estMinutes,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toCatalogTask(row: typeof catalogTasks.$inferSelect): CatalogTask {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    scholarshipId: row.scholarshipId,
    payload: row.payload,
    createdById: row.createdById,
    resolvedById: row.resolvedById,
    resolutionNote: row.resolutionNote,
    createdAt: toIso(row.createdAt),
    resolvedAt: toIsoOrNull(row.resolvedAt),
  };
}

export function toReport(row: typeof catalogReports.$inferSelect, scholarshipName: string): CatalogReport {
  return {
    id: row.id,
    scholarshipId: row.scholarshipId,
    scholarshipName,
    reporterId: row.reporterId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: toIso(row.createdAt),
    resolvedAt: toIsoOrNull(row.resolvedAt),
  };
}

export function toAuditEvent(row: typeof auditEvents.$inferSelect): AuditEvent {
  return {
    id: row.id,
    actorId: row.actorId,
    actorKind: row.actorKind,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    meta: row.meta,
    createdAt: toIso(row.createdAt),
  };
}
