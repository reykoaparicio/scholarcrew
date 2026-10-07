import { describe, expect, it } from "vitest";
import * as domain from "./index";
import { JOB_KIND_QUEUE, JOB_NAMES, JobPayloadSchemas, QUEUE_EXPIRE_SECONDS } from "./jobs";

describe("job payloads", () => {
  it("has a payload schema for every job name and nothing else", () => {
    expect(JOB_NAMES).toHaveLength(20);
    expect(Object.keys(JobPayloadSchemas).sort()).toEqual([...JOB_NAMES].sort());
    expect(JOB_NAMES.indexOf("plan.weekly.fanout")).toBe(JOB_NAMES.indexOf("plan.weekly") + 1);
    expect(JOB_NAMES.indexOf("notify.sms")).toBe(JOB_NAMES.indexOf("notify.email") + 1);
  });

  it("validates payloads", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(JobPayloadSchemas["crew.request"].safeParse({ jobId: id }).success).toBe(true);
    expect(JobPayloadSchemas["crew.request"].safeParse({}).success).toBe(false);
    expect(JobPayloadSchemas["sweep.weekly"].safeParse({}).success).toBe(true);
    expect(JobPayloadSchemas["catalog.research"].safeParse({ state: "TX", county: null }).success).toBe(true);
  });

  it("takes plan.weekly with or without a source, and the fan-out and SMS payloads (R2C-5, R2I-9)", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(JobPayloadSchemas["plan.weekly"].parse({ jobId: id, ownerId: id }).source).toBeUndefined();
    expect(JobPayloadSchemas["plan.weekly"].parse({ jobId: id, ownerId: id, source: "system" }).source).toBe("system");
    expect(JobPayloadSchemas["plan.weekly"].safeParse({ jobId: id, ownerId: id, source: "cron" }).success).toBe(false);
    expect(JobPayloadSchemas["plan.weekly.fanout"].safeParse({}).success).toBe(true);
    expect(JobPayloadSchemas["plan.weekly.fanout"].safeParse({ ownerId: id }).success).toBe(false);
    expect(JobPayloadSchemas["notify.sms"].safeParse({ notificationId: id }).success).toBe(true);
    expect(JobPayloadSchemas["notify.sms"].safeParse({}).success).toBe(false);
  });
});

describe("index", () => {
  it("re-exports every module", () => {
    for (const name of [
      "AppError",
      "User",
      "Profile",
      "MemoryFact",
      "FamilyView",
      "Scholarship",
      "College",
      "Essay",
      "TestScore",
      "ServiceLog",
      "OfferComparison",
      "AidChecklist",
      "PlanItem",
      "HelperView",
      "CrewReply",
      "CatalogTask",
      "Notification",
      "Subscription",
      "DocumentMeta",
      "AutofillProfile",
      "JobPayloadSchemas",
      "parseMentions",
      "STATE_NAMES",
      "localLabel",
      "CrewSpeaker",
      "CrewRequester",
      "PROFILE_FACT_KEYS",
      "FederalLoanRates",
      "AidRuleKey",
      "AidRule",
      "AidRuleInput",
      "AidDeadlineInput",
      "RecRequestPatch",
      "EssayPatch",
      "awardYearFor",
      "DisplayName",
      "APP_PLAN_LABELS",
      "APPLICATION_STAGE_LABELS",
    ]) {
      expect(domain).toHaveProperty(name);
    }
    expect(domain.APP_PLAN_LABELS.RD).toBe("Regular Decision");
    expect(domain.APPLICATION_STAGE_LABELS.lost).toBe("Didn't win");
    expect(Object.keys(domain.APP_PLAN_LABELS).sort()).toEqual([...domain.AppPlan.options].sort());
    expect(Object.keys(domain.APPLICATION_STAGE_LABELS).sort()).toEqual([...domain.ApplicationStage.options].sort());
  });

  it("parses mentions", () => {
    expect(domain.parseMentions("@Ledger how much? cc @scout and @Nobody")).toEqual(["ledger", "scout"]);
  });
});

describe("queue expiry contracts", () => {
  it("covers every queue and crew kind", () => {
    expect(Object.keys(QUEUE_EXPIRE_SECONDS).sort()).toEqual([...JOB_NAMES].sort());
    expect(QUEUE_EXPIRE_SECONDS["crew.request"]).toBe(1200);
    expect(QUEUE_EXPIRE_SECONDS["catalog.research"]).toBe(2400);
    expect(QUEUE_EXPIRE_SECONDS["essay.review"]).toBe(900);
    expect(Object.keys(JOB_KIND_QUEUE)).toHaveLength(6);
    expect(JOB_KIND_QUEUE.offer_parse).toBe("offer.parse");
  });
});
