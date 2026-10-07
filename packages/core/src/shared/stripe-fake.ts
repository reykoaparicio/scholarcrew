import type { StripeGateway } from "./types";

type CheckoutArgs = Parameters<StripeGateway["createCheckoutSession"]>[0];
type PortalArgs = Parameters<StripeGateway["createPortalSession"]>[0];

export type FakeStripeGateway = StripeGateway & {
  checkouts: CheckoutArgs[];
  portals: PortalArgs[];
  canceled: string[];
};

/** Records calls and returns numbered fake URLs. No network. */
export function createFakeStripeGateway(): FakeStripeGateway {
  const checkouts: CheckoutArgs[] = [];
  const portals: PortalArgs[] = [];
  const canceled: string[] = [];
  return {
    checkouts,
    portals,
    canceled,
    async createCheckoutSession(i) {
      checkouts.push(i);
      return { url: `https://checkout.stripe.test/session/${checkouts.length}` };
    },
    async createPortalSession(i) {
      portals.push(i);
      return { url: `https://billing.stripe.test/portal/${portals.length}` };
    },
    async cancelSubscription(subscriptionId) {
      if (!canceled.includes(subscriptionId)) canceled.push(subscriptionId);
    },
  };
}
