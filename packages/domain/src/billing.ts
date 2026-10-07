import { z } from "zod";
import { IsoDateTime } from "./common";

export const PlanId = z.enum(["free", "family", "season_pass"]);
export type PlanId = z.infer<typeof PlanId>;

export const SubscriptionStatus = z.enum(["active", "past_due", "canceled", "expired"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const PLAN_LIMITS: Record<PlanId, { crewRequestsPerMonth: number }> = {
  free: { crewRequestsPerMonth: 20 },
  family: { crewRequestsPerMonth: 300 },
  season_pass: { crewRequestsPerMonth: 300 },
};

export const Subscription = z.strictObject({
  plan: PlanId,
  status: SubscriptionStatus,
  currentPeriodEnd: IsoDateTime.nullable(),
  managedByStripe: z.boolean(),
  sponsor: z.string().nullable(),
});
export type Subscription = z.infer<typeof Subscription>;

export const UsageSummary = z.strictObject({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  crewRequests: z.number().int().min(0),
  limit: z.number().int().min(0),
  costMicros: z.number().int().min(0),
});
export type UsageSummary = z.infer<typeof UsageSummary>;

export const CheckoutInput = z.strictObject({ plan: z.enum(["family", "season_pass"]) });
export type CheckoutInput = z.infer<typeof CheckoutInput>;

export const BillingView = z.strictObject({ subscription: Subscription, usage: UsageSummary });
export type BillingView = z.infer<typeof BillingView>;

export const SponsorCodeInput = z.strictObject({ code: z.string().min(4).max(40) });
export type SponsorCodeInput = z.infer<typeof SponsorCodeInput>;
