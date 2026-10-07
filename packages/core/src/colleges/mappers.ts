import type { applicationItems, colleges, recRequests, recommenders } from "@scholarcrew/db";
import type {
  AppPlan,
  ApplicationItem,
  College,
  CollegeDeadlines,
  CollegeSummary,
  IsoDate,
  RecRequest,
  Recommender,
} from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type CollegeRow = typeof colleges.$inferSelect;

export function deadlineFor(deadlines: CollegeDeadlines, plan: AppPlan): IsoDate | null {
  if (plan === "rolling") return null;
  return deadlines[plan] ?? null;
}

export function toCollege(row: CollegeRow): College {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    city: row.city,
    control: row.control,
    admitRate: row.admitRateX1000 === null ? null : row.admitRateX1000 / 1000,
    costOfAttendanceUsd: row.costOfAttendanceUsd,
    netPriceByIncome: row.netPriceByIncome,
    testPolicy: row.testPolicy,
    superscore: row.superscore,
    cssProfileRequired: row.cssProfileRequired,
    outsidePolicy: row.outsidePolicy,
    meritTiers: row.meritTiers,
    deadlines: row.deadlines,
    requirements: row.requirements,
    aidPriorityDate: row.aidPriorityDate,
    sourceUrl: row.sourceUrl,
    verifiedAt: toIsoOrNull(row.verifiedAt),
  };
}

export function toCollegeSummary(row: CollegeRow): CollegeSummary {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    city: row.city,
    control: row.control,
    admitRate: row.admitRateX1000 === null ? null : row.admitRateX1000 / 1000,
    costOfAttendanceUsd: row.costOfAttendanceUsd,
    testPolicy: row.testPolicy,
  };
}

export function toApplicationItem(row: typeof applicationItems.$inferSelect): ApplicationItem {
  return {
    id: row.id,
    collegeListId: row.collegeListId,
    kind: row.kind,
    label: row.label,
    status: row.status,
    dueOn: row.dueOn,
    essayId: row.essayId,
    updatedAt: toIso(row.updatedAt),
  };
}

export function toRecommender(row: typeof recommenders.$inferSelect): Recommender {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    relationship: row.relationship,
    createdAt: toIso(row.createdAt),
  };
}

export function toRecRequest(row: typeof recRequests.$inferSelect): RecRequest {
  return {
    id: row.id,
    recommenderId: row.recommenderId,
    collegeListId: row.collegeListId,
    scholarshipApplicationId: row.scholarshipApplicationId,
    helperLinkId: row.helperLinkId,
    status: row.status,
    requestedAt: toIsoOrNull(row.requestedAt),
    updatedAt: toIso(row.updatedAt),
  };
}
