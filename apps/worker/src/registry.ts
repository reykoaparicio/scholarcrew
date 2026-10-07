import type { JobName } from "@scholarcrew/jobs";
import { handleAccountExport } from "./handlers/account-export";
import { handleAccountPurge } from "./handlers/account-purge";
import { handleAppealOutline } from "./handlers/appeal-outline";
import { handleCatalogExtract } from "./handlers/catalog-extract";
import { handleCatalogRecheck } from "./handlers/catalog-recheck";
import { handleCatalogRecheckCollect } from "./handlers/catalog-recheck-collect";
import { handleCatalogResearch } from "./handlers/catalog-research";
import { handleCrewRequest } from "./handlers/crew-request";
import { handleDigestWeekly } from "./handlers/digest-weekly";
import { handleEssayReview } from "./handlers/essay-review";
import { handleMaintenancePurge } from "./handlers/maintenance-purge";
import { handleNotifyEmail } from "./handlers/notify-email";
import { handleNotifySms } from "./handlers/notify-sms";
import { handleOfferParse } from "./handlers/offer-parse";
import { handlePlanWeekly } from "./handlers/plan-weekly";
import { handlePlanWeeklyFanout } from "./handlers/plan-weekly-fanout";
import { handlePrepRetake } from "./handlers/prep-retake";
import { handleRemindersDeadlines } from "./handlers/reminders-deadlines";
import { handleSweepStudent } from "./handlers/sweep-student";
import { handleSweepWeekly } from "./handlers/sweep-weekly";
import type { Handler } from "./types";

/** One handler per JOB_NAMES entry (20). Record<JobName, Handler> makes a missing or extra name a type error. */
export const HANDLERS: Record<JobName, Handler> = {
  "crew.request": handleCrewRequest,
  "essay.review": handleEssayReview,
  "offer.parse": handleOfferParse,
  "appeal.outline": handleAppealOutline,
  "plan.weekly": handlePlanWeekly,
  "plan.weekly.fanout": handlePlanWeeklyFanout,
  "prep.retake": handlePrepRetake,
  "sweep.weekly": handleSweepWeekly,
  "sweep.student": handleSweepStudent,
  "reminders.deadlines": handleRemindersDeadlines,
  "digest.weekly": handleDigestWeekly,
  "notify.email": handleNotifyEmail,
  "notify.sms": handleNotifySms,
  "catalog.research": handleCatalogResearch,
  "catalog.extract": handleCatalogExtract,
  "catalog.recheck": handleCatalogRecheck,
  "catalog.recheck.collect": handleCatalogRecheckCollect,
  "account.export": handleAccountExport,
  "account.purge": handleAccountPurge,
  "maintenance.purge": handleMaintenancePurge,
};
