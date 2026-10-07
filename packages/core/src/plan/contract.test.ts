import { describe, expect, it } from "vitest";
import * as admin from "../admin";
import * as aid from "../aid";
import * as crew from "../crew";
import * as money from "../money";
import * as plan from "./index";

const CONTRACT: Record<string, { mod: Record<string, unknown>; names: string[] }> = {
  money: {
    mod: money,
    names: [
      "compareMyOffers",
      "confirmOffer",
      "costsFor",
      "createOffer",
      "deleteOffer",
      "getCosts",
      "getOffer",
      "listOffers",
      "loanEstimates",
      "markOfferFailed",
      "publicOfferTool",
      "requestAppealOutline",
      "saveParsedOffer",
      "setCalculatorResult",
      "updateOfferLine",
    ],
  },
  aid: { mod: aid, names: ["ensureChecklists", "getAidChecklists", "listAidDeadlines", "updateAidItem"] },
  plan: {
    mod: plan,
    names: [
      "addPlanItem",
      "buildWeeklyDigest",
      "findDueReminders",
      "getThisWeek",
      "getWeekPlan",
      "listUpcomingDeadlines",
      "replaceGeneratedPlan",
      "requestWeeklyPlan",
      "startWeeklyPlan",
      "updatePlanItem",
    ],
  },
  crew: {
    mod: crew,
    names: [
      "appendProgress",
      "applyActionCard",
      "completeJob",
      "createConversation",
      "createJob",
      "getJob",
      "getMessages",
      "listConversations",
      "listJobs",
      "reapStaleJobs",
      "recordAgentRun",
      "releaseJob",
      "sendMessage",
      "startJob",
    ],
  },
  admin: {
    mod: admin,
    names: [
      "createCatalogTask",
      "deleteAidDeadline",
      "enqueueResearch",
      "getCatalogTask",
      "getScholarshipForAdmin",
      "importColleges",
      "listAidDeadlinesForAdmin",
      "listAidRules",
      "listCatalogTasks",
      "listReports",
      "listScholarships",
      "resolveCatalogTask",
      "resolveReport",
      "searchAudit",
      "setScholarshipStatus",
      "upsertAidDeadline",
      "upsertAidRule",
      "upsertScholarship",
    ],
  },
};

describe("plan 08 module surfaces", () => {
  for (const [name, { mod, names }] of Object.entries(CONTRACT)) {
    it(`${name} exports exactly the section 9.4 functions`, () => {
      expect(Object.keys(mod).sort()).toEqual(names);
      for (const fn of names) expect(typeof mod[fn]).toBe("function");
    });
  }
});
