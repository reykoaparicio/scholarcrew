import type { JobName } from "@scholarcrew/domain";

/**
 * Cron jobs the worker registers with boss.schedule(name, cron, {}, { tz }).
 * Hourly digest and reminder checks pick students whose local day and hour match.
 * plan.weekly.fanout runs Monday 11:00 UTC (01:00 Honolulu to 07:00 New York, Monday everywhere in the US),
 * so weekStartFor lands on the new Monday for every student (R2C-5).
 */
export const SCHEDULES: Array<{ name: JobName; cron: string; tz: "UTC" }> = [
  { name: "sweep.weekly", cron: "0 14 * * 0", tz: "UTC" },
  { name: "plan.weekly.fanout", cron: "0 11 * * 1", tz: "UTC" },
  { name: "reminders.deadlines", cron: "0 * * * *", tz: "UTC" },
  { name: "digest.weekly", cron: "5 * * * *", tz: "UTC" },
  { name: "catalog.recheck", cron: "0 8 * * *", tz: "UTC" },
  { name: "catalog.recheck.collect", cron: "*/30 * * * *", tz: "UTC" },
  { name: "account.purge", cron: "30 3 * * *", tz: "UTC" },
  { name: "maintenance.purge", cron: "*/10 * * * *", tz: "UTC" },
];
