import { body, route } from "@/server/http";
import { completeOnboarding } from "@scholarcrew/core/profile";
import { OnboardingInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  completeOnboarding(deps, actor, await body(req, OnboardingInput)),
);
