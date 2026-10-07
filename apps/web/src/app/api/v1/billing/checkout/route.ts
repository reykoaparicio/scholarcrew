import { body, route } from "@/server/http";
import { createCheckout } from "@scholarcrew/core/billing";
import { CheckoutInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  createCheckout(deps, actor, await body(req, CheckoutInput)),
);
