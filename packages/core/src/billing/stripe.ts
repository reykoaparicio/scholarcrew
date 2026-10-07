import {
  and,
  eq,
  isNull,
  lt,
  lte,
  ne,
  or,
  sponsorCodes,
  sponsorRedemptions,
  sql,
  stripeEvents,
  subscriptions,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  CheckoutInput,
  type PlanId,
  SponsorCodeInput,
  type Subscription,
  type SubscriptionStatus,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import Stripe from "stripe";
import { assertRole, assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { type CoreDeps, type StripeGateway, currentSeason, isUuid, one, seasonStartYear } from "../shared";
import { getSubscription, isPaidAndLive, ownSubscription } from "./plans";

type StripeObject = Record<string, unknown>;

/** End of a season pass: May 31 (23:59:59 UTC) of the current season's second year, or the next one if that's past. */
export function seasonPassEnd(now: Date): Date {
  const start = seasonStartYear(currentSeason(now));
  const end = new Date(Date.UTC(start + 1, 4, 31, 23, 59, 59));
  return end > now ? end : new Date(Date.UTC(start + 2, 4, 31, 23, 59, 59));
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function rec(v: unknown): StripeObject | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as StripeObject) : null;
}

/** Stripe API 2025+ puts current_period_end on subscription items; older versions put it on the subscription. */
function periodEnd(o: StripeObject): Date | null {
  const direct = o.current_period_end;
  const items = rec(o.items);
  const data = items && Array.isArray(items.data) ? items.data : [];
  const first = rec(data[0]);
  const fromItem = first ? first.current_period_end : undefined;
  const seconds = typeof direct === "number" ? direct : typeof fromItem === "number" ? fromItem : null;
  return seconds === null ? null : new Date(seconds * 1000);
}

function mapStatus(status: string | null): SubscriptionStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
}

function invoiceSubscriptionId(o: StripeObject): string | null {
  const direct = str(o.subscription);
  if (direct) return direct;
  const details = rec(rec(o.parent)?.subscription_details);
  return str(details?.subscription);
}

export async function createCheckout(deps: CoreDeps, actor: Actor, i: CheckoutInput): Promise<{ url: string }> {
  assertUser(actor);
  const parsed = CheckoutInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Choose a plan");
  if (!deps.stripe) throw new AppError("internal", "Billing isn't set up");
  const me = one(await deps.db.select().from(users).where(eq(users.id, actor.userId)), "users select");
  const own = await ownSubscription(deps.db, me.id);
  if ((own?.stripeSubscriptionId && own.status !== "canceled") || (own && isPaidAndLive(own, deps.clock.now())))
    throw conflict("You already have a subscription. Manage it from Billing.");
  const family = parsed.data.plan === "family";
  return deps.stripe.createCheckoutSession(
    {
      customerEmail: me.email,
      priceId: family ? deps.config.stripePriceFamily : deps.config.stripePriceSeason,
      mode: family ? "subscription" : "payment",
      successUrl: `${deps.config.appUrl}/settings?billing=success`,
      cancelUrl: `${deps.config.appUrl}/settings?billing=cancel`,
      clientReferenceId: me.id,
    },
    { idempotencyKey: `checkout:${me.id}:${parsed.data.plan}:${Math.floor(deps.clock.now().getTime() / 60_000)}` },
  );
}

export async function createPortal(deps: CoreDeps, actor: Actor): Promise<{ url: string }> {
  assertUser(actor);
  if (!deps.stripe) throw new AppError("internal", "Billing isn't set up");
  const own = await ownSubscription(deps.db, actor.userId);
  if (!own?.stripeCustomerId) throw invalidInput("There's no billing account to manage yet");
  return deps.stripe.createPortalSession({
    customerId: own.stripeCustomerId,
    returnUrl: `${deps.config.appUrl}/settings`,
  });
}

async function checkoutCompleted(
  deps: CoreDeps,
  system: Actor,
  o: StripeObject,
  now: Date,
  created: number,
): Promise<void> {
  const userId = str(o.client_reference_id);
  if (!userId || !isUuid(userId)) return;
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user) return;
  const subscriptionId = str(o.subscription);
  if (user.status !== "active") {
    if (subscriptionId && !deps.stripe) throw new AppError("internal", "Billing isn't set up");
    if (subscriptionId && deps.stripe) await deps.stripe.cancelSubscription(subscriptionId);
    await recordAudit(deps, { actor: system, action: "subscription_refused", entityType: "user", entityId: userId });
    return;
  }
  if (o.payment_status !== "paid" && o.payment_status !== "no_payment_required") return;
  const plan: PlanId = str(o.mode) === "payment" ? "season_pass" : "family";
  const own = await ownSubscription(deps.db, userId);
  if (subscriptionId && own?.stripeSubscriptionId === subscriptionId && own.status === "canceled") return;
  if (own?.stripeEventAt && own.stripeEventAt.getTime() > created * 1000) return;
  if (own?.stripeSubscriptionId && own.status !== "canceled" && own.stripeSubscriptionId !== subscriptionId) {
    if (!deps.stripe) throw new AppError("internal", "Billing isn't set up");
    await deps.stripe.cancelSubscription(own.stripeSubscriptionId);
    await recordAudit(deps, {
      actor: system,
      action: "subscription_replaced",
      entityType: "user",
      entityId: userId,
      meta: { plan },
    });
  }
  const set = {
    plan,
    status: "active" as const,
    stripeCustomerId: str(o.customer),
    stripeSubscriptionId: plan === "family" ? subscriptionId : null,
    currentPeriodEnd: plan === "season_pass" ? seasonPassEnd(new Date(created * 1000)) : null,
    stripeEventAt: new Date(created * 1000),
    updatedAt: now,
  };
  await deps.db
    .insert(subscriptions)
    .values({ ownerId: userId, createdAt: now, ...set })
    .onConflictDoUpdate({ target: subscriptions.ownerId, set });
  await recordAudit(deps, {
    actor: system,
    action: "subscription_started",
    entityType: "user",
    entityId: userId,
    meta: { plan },
  });
}

export async function applyStripeEvent(
  deps: CoreDeps,
  system: Actor,
  e: { id: string; type: string; created: number; data: { object: Record<string, unknown> } },
): Promise<void> {
  assertSystem(system);
  await deps.db.transaction(async (tx) => {
    const claim = await tx.insert(stripeEvents).values({ id: e.id, type: e.type }).onConflictDoNothing().returning();
    if (!claim.length) return;
    const o = e.data.object;
    const now = deps.clock.now();
    const eventAt = new Date(e.created * 1000);
    // Transaction exposes the same query surface; scoped deps keep all audit/grant writes atomic.
    const scoped = { ...deps, db: tx as unknown as CoreDeps["db"] };
    const referenceOwner = str(o.client_reference_id);
    const providerId = e.type.startsWith("customer.subscription.")
      ? str(o.id)
      : (invoiceSubscriptionId(o) ?? str(o.subscription));
    const [known] = providerId
      ? await tx
          .select({ ownerId: subscriptions.ownerId })
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, providerId))
          .limit(1)
      : [];
    const ownerKey = referenceOwner ?? known?.ownerId;
    if (ownerKey) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stripe-owner:${ownerKey}`}))`);
    const ordered = or(isNull(subscriptions.stripeEventAt), lte(subscriptions.stripeEventAt, eventAt));
    switch (e.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await checkoutCompleted(scoped, system, o, now, e.created);
        return;
      case "checkout.session.async_payment_failed":
        await recordAudit(scoped, {
          actor: system,
          action: "checkout_payment_failed",
          entityType: "stripe_event",
          entityId: e.id,
        });
        return;
      case "customer.subscription.updated": {
        const id = str(o.id);
        if (!id) return;
        const end = periodEnd(o);
        await tx
          .update(subscriptions)
          .set({
            status: mapStatus(str(o.status)),
            stripeEventAt: eventAt,
            updatedAt: now,
            ...(end ? { currentPeriodEnd: end } : {}),
          })
          .where(and(eq(subscriptions.stripeSubscriptionId, id), ne(subscriptions.status, "canceled"), ordered));
        return;
      }
      case "customer.subscription.deleted": {
        const id = str(o.id);
        if (!id) return;
        await tx
          .update(subscriptions)
          .set({ status: "canceled", stripeEventAt: eventAt, updatedAt: now })
          .where(and(eq(subscriptions.stripeSubscriptionId, id), ordered));
        return;
      }
      case "invoice.payment_failed": {
        const id = invoiceSubscriptionId(o);
        if (!id) return;
        await tx
          .update(subscriptions)
          .set({ status: "past_due", stripeEventAt: eventAt, updatedAt: now })
          .where(and(eq(subscriptions.stripeSubscriptionId, id), ne(subscriptions.status, "canceled"), ordered));
        return;
      }
    }
  });
}

export function createStripeGateway(secretKey: string): StripeGateway {
  const stripe = new Stripe(secretKey);
  return {
    async createCheckoutSession(i, options) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: i.mode,
          line_items: [{ price: i.priceId, quantity: 1 }],
          customer_email: i.customerEmail,
          success_url: i.successUrl,
          cancel_url: i.cancelUrl,
          client_reference_id: i.clientReferenceId,
          ...(i.mode === "payment" ? { customer_creation: "always" as const } : {}),
        },
        options,
      );
      if (!session.url) throw new AppError("internal", "Stripe returned no checkout URL");
      return { url: session.url };
    },
    async createPortalSession(i) {
      const session = await stripe.billingPortal.sessions.create({ customer: i.customerId, return_url: i.returnUrl });
      return { url: session.url };
    },
    async cancelSubscription(subscriptionId) {
      try {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        if (current.status === "canceled" || current.status === "incomplete_expired") return;
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") return;
        throw error;
      }
    },
  };
}

/** Verifies the Stripe-Signature header. A bad signature is invalid_input. */
export function parseStripeWebhook(
  rawBody: string,
  signature: string,
  secret: string,
  secretKey: string,
): { id: string; type: string; created: number; data: { object: Record<string, unknown> } } {
  // The client is only used for signature checks here, so a placeholder key is fine when billing is off.
  const stripe = new Stripe(secretKey || "sk_test_webhook_only");
  let parsed: Stripe.Event;
  try {
    parsed = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw invalidInput("Invalid Stripe signature");
  }
  return {
    id: parsed.id,
    type: parsed.type,
    created: parsed.created,
    data: { object: parsed.data.object as unknown as Record<string, unknown> },
  };
}

/** BI-05: a school or nonprofit code grants its plan to a student for the season. */
export async function redeemSponsorCode(deps: CoreDeps, actor: Actor, code: string): Promise<Subscription> {
  assertRole(actor, "student");
  const parsed = SponsorCodeInput.safeParse({ code: code.trim() });
  if (!parsed.success) throw invalidInput("Enter the code from your sponsor");
  const now = deps.clock.now();
  const userId = actor.userId;
  const [sponsor] = await deps.db.select().from(sponsorCodes).where(eq(sponsorCodes.code, parsed.data.code));
  if (!sponsor || sponsor.expiresAt <= now) throw notFound("That code isn't valid or has expired");
  const [used] = await deps.db
    .select()
    .from(sponsorRedemptions)
    .where(and(eq(sponsorRedemptions.code, sponsor.code), eq(sponsorRedemptions.userId, userId)));
  if (used) throw conflict("You've already used this code");
  const own = await ownSubscription(deps.db, userId);
  if (own?.stripeSubscriptionId && own.status !== "canceled")
    throw conflict("Cancel your current plan in Billing before using a sponsor code.");
  if (own && isPaidAndLive(own, now)) throw conflict("You already have a paid plan");
  await deps.db.transaction(async (tx) => {
    const claimed = await tx
      .update(sponsorCodes)
      .set({ seatsUsed: sql`${sponsorCodes.seatsUsed} + 1` })
      .where(and(eq(sponsorCodes.code, sponsor.code), lt(sponsorCodes.seatsUsed, sponsorCodes.seatsTotal)))
      .returning({ code: sponsorCodes.code });
    if (claimed.length === 0) throw new AppError("limit_reached", "This code has no seats left");
    await tx.insert(sponsorRedemptions).values({ code: sponsor.code, userId, redeemedAt: now });
    const set = {
      plan: sponsor.plan,
      status: "active" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: seasonPassEnd(now),
      updatedAt: now,
    };
    await tx
      .insert(subscriptions)
      .values({ ownerId: userId, createdAt: now, ...set })
      .onConflictDoUpdate({ target: subscriptions.ownerId, set });
  });
  await recordAudit(deps, {
    actor,
    action: "sponsor_code_redeemed",
    entityType: "sponsor_code",
    entityId: sponsor.code,
  });
  return getSubscription(deps, actor);
}
