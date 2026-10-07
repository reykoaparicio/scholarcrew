import type { activities, serviceLogs } from "@scholarcrew/db";
import type { Activity, ServiceLog } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export function toServiceLog(row: typeof serviceLogs.$inferSelect): ServiceLog {
  return {
    id: row.id,
    organization: row.organization,
    activity: row.activity,
    servedOn: row.servedOn,
    minutes: row.minutes,
    supervisorName: row.supervisorName,
    supervisorEmail: row.supervisorEmail,
    verification: row.verification,
    // Lets 17 show "Link expired" and offer a new request once a `requested` link lapses (R2P-10).
    verificationExpiresAt: toIsoOrNull(row.verificationExpiresAt),
    verifiedAt: toIsoOrNull(row.verifiedAt),
    verifierNote: row.verifierNote,
    reflection: row.reflection,
    createdAt: toIso(row.createdAt),
  };
}

export function toActivity(row: typeof activities.$inferSelect): Activity {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    role: row.role,
    organization: row.organization,
    description: row.description,
    hoursPerWeek: row.hoursPerWeek,
    weeksPerYear: row.weeksPerYear,
    grades: row.grades,
    category: row.category,
  };
}
