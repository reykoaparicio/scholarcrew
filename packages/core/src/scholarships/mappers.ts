import type { crewJobs, planItems, scholarshipApplications, scholarships } from "@scholarcrew/db";
import {
  type CrewJob,
  type PlanItem,
  type Scholarship,
  type ScholarshipApplication,
  type ScholarshipSummary,
  localLabel,
} from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type ScholarshipRow = typeof scholarships.$inferSelect;
export type ApplicationRow = typeof scholarshipApplications.$inferSelect;

export const STALE_AFTER_DAYS = 30;

export function isStale(row: Pick<ScholarshipRow, "status" | "verifiedAt">, now: Date): boolean {
  if (row.status === "stale") return true;
  if (!row.verifiedAt) return false;
  return now.getTime() - row.verifiedAt.getTime() > STALE_AFTER_DAYS * 86_400_000;
}

export function toScholarship(row: ScholarshipRow, viewerId?: string): Scholarship {
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
    submittedById: viewerId === row.submittedById ? row.submittedById : null,
    scamFlags: row.scamFlags,
    estMinutes: row.estMinutes,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toSummary(row: ScholarshipRow): ScholarshipSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    amountMinUsd: row.amountMinUsd,
    amountMaxUsd: row.amountMaxUsd,
    renewable: row.renewable,
    deadline: row.deadline,
    localLabel: localLabel(row.localArea),
    status: row.status,
    verifiedAt: toIsoOrNull(row.verifiedAt),
    scamFlags: row.scamFlags,
    unverified: row.verifiedAt === null || row.visibility === "submitter_only",
    estMinutes: row.estMinutes,
  };
}

export function toApplication(row: ApplicationRow): ScholarshipApplication {
  return {
    id: row.id,
    scholarshipId: row.scholarshipId,
    stage: row.stage,
    matchReasons: row.matchReasons,
    fitScore: row.fitScore,
    estMinutes: row.estMinutes,
    submittedAt: toIsoOrNull(row.submittedAt),
    outcomeUsd: row.outcomeUsd,
    outcomeRenewable: row.outcomeRenewable,
    outcomeAt: toIsoOrNull(row.outcomeAt),
    thankYouSent: row.thankYouSent,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toPlanItem(row: typeof planItems.$inferSelect): PlanItem {
  return {
    id: row.id,
    weekStart: row.weekStart,
    title: row.title,
    kind: row.kind,
    refType: row.refType,
    refId: row.refId,
    minutes: row.minutes,
    valueUsd: row.valueUsd,
    dueOn: row.dueOn,
    status: row.status,
    contributors: row.contributors,
    priority: row.priority,
    createdAt: toIso(row.createdAt),
    completedAt: toIsoOrNull(row.completedAt),
  };
}

export function toCrewJob(row: typeof crewJobs.$inferSelect): CrewJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    conversationId: row.conversationId,
    requestMessageId: row.requestMessageId,
    resultMessageId: row.resultMessageId,
    refId: row.refId,
    progress: row.progress,
    error: row.error,
    safety: row.safety ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
