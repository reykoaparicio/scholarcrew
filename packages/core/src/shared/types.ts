import type { Db } from "@scholarcrew/db";
import type { JobsClient } from "@scholarcrew/jobs";

export interface Clock {
  now(): Date;
}

export interface EmailSender {
  send(m: { to: string; subject: string; text: string }, o?: { idempotencyKey?: string }): Promise<void>;
}

/**
 * R2I-9: text-message sender. The worker passes one to `deliverSms` (Twilio in production, the dev
 * outbox otherwise, plan 12 `src/sms.ts`). It isn't part of CoreDeps.
 */
export interface SmsSender {
  send(m: { to: string; text: string }): Promise<void>;
}

export interface StripeGateway {
  createCheckoutSession(
    i: {
      customerEmail: string;
      priceId: string;
      mode: "subscription" | "payment";
      successUrl: string;
      cancelUrl: string;
      clientReferenceId: string;
    },
    o?: { idempotencyKey: string },
  ): Promise<{ url: string }>;
  createPortalSession(i: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Cancels a subscription at once (account deletion). */
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export interface CoreConfig {
  appUrl: string;
  keyring: import("../crypto").Keyring;
  sessionDays: number;
  stripePriceFamily: string;
  stripePriceSeason: string;
  stripeWebhookSecret: string;
}

export interface CoreDeps {
  db: Db;
  jobs: JobsClient;
  clock: Clock;
  email: EmailSender;
  config: CoreConfig;
  stripe: StripeGateway | null;
}
