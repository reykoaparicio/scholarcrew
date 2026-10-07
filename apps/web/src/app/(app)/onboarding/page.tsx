import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { loadMe } from "@/lib/pageActor";
import { requirePageActor } from "@/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const actor = await requirePageActor();
  if (actor.role !== "student") redirect("/week");
  const me = await loadMe(actor.userId, actor.role);
  if (me.onboardingComplete) redirect("/week");
  return (
    <OnboardingWizard
      initialName={me.user.displayName}
      initialTimeZone={me.user.timeZone}
      nowIso={new Date().toISOString()}
    />
  );
}
