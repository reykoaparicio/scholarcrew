import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getMe } from "@scholarcrew/core/profile";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type MeResponse, type Role, type UserActor, userActor } from "@scholarcrew/domain";
import { redirect } from "next/navigation";
import { cache } from "react";

/** One getMe per request, shared by the (app) layout and the page. */
export const loadMe = cache(
  async (userId: string, role: Role): Promise<MeResponse> => getMe(getDeps(), userActor(userId, role)),
);

export interface AppPageContext {
  actor: UserActor;
  me: MeResponse;
  deps: CoreDeps;
}

/** requirePageActor + getMe; students who haven't finished onboarding go to /onboarding. */
export async function requireAppActor(roles?: Role[]): Promise<AppPageContext> {
  const actor = await requirePageActor(roles);
  const me = await loadMe(actor.userId, actor.role);
  if (!me.onboardingComplete) redirect("/onboarding");
  return { actor, me, deps: getDeps() };
}
