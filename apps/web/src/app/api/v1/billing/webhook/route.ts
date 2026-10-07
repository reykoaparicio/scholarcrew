import { stripeSecretKey } from "@/server/deps";
import { JSON_BODY_LIMIT, readTextCapped, route } from "@/server/http";
import { applyStripeEvent, parseStripeWebhook } from "@scholarcrew/core/billing";
import { invalidInput, notFound, systemActor } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "none", csrf: false }, async ({ req, deps }) => {
  if (!deps.config.stripeWebhookSecret) throw notFound();
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw invalidInput("Missing Stripe signature");
  const raw = await readTextCapped(req, JSON_BODY_LIMIT);
  const event = parseStripeWebhook(raw, signature, deps.config.stripeWebhookSecret, stripeSecretKey());
  await applyStripeEvent(deps, systemActor("stripe_webhook"), event);
});
