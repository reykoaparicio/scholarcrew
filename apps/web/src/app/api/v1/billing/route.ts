import { route } from "@/server/http";
import { getSubscription, getUsage } from "@scholarcrew/core/billing";
import type { BillingView } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }): Promise<BillingView> => {
  const subscription = await getSubscription(deps, actor);
  const usage = await getUsage(deps, actor);
  return { subscription, usage };
});
