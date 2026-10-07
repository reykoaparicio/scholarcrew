import { body, route } from "@/server/http";
import { applyActionCard } from "@scholarcrew/core/crew";
import { ApplyActionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nothing changes until the student presses the card (CR-05); the receipt is unique per (message, card).
export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  applyActionCard(deps, actor, await body(req, ApplyActionInput)),
);
