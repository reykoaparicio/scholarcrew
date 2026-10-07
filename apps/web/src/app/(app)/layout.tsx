import { NotificationBell } from "@/components/shell/NotificationBell";
import { OnboardingGate } from "@/components/shell/OnboardingGate";
import { SetupFrame } from "@/components/shell/SetupFrame";
import { ShellFrame } from "@/components/shell/ShellFrame";
import {
  enabledOptionalCrew,
  mobileTabsFor,
  navFor,
  onboardingRedirect,
  rosterFor,
  sharedCategoriesOf,
  userCard,
} from "@/components/shell/nav";
import { loadMe } from "@/lib/pageActor";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getFamily, getShareSettings } from "@scholarcrew/core/family";
import { listFacts } from "@scholarcrew/core/memory";
import type { ShareCategory, UserActor } from "@scholarcrew/domain";
import { Button, Topbar } from "@scholarcrew/ui";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/** A parent's view of what their student shares; the nav only hides links, the pages still check (E-16-2). */
async function parentShares(actor: UserActor): Promise<ShareCategory[]> {
  const deps = getDeps();
  const family = await getFamily(deps, actor);
  const student = family?.members.find((member) => member.memberRole === "student");
  if (!student) return [];
  return sharedCategoriesOf(await getShareSettings(deps, actor, student.userId));
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor();
  if (actor.role === "admin") redirect("/admin");
  const me = await loadMe(actor.userId, actor.role);
  const card = userCard(me);

  if (!me.onboardingComplete) {
    // D30: plan 13's middleware forwards x-pathname; without it the client gate below redirects.
    const pathname = (await headers()).get("x-pathname");
    const target =
      pathname === null ? null : onboardingRedirect({ role: me.user.role, onboardingComplete: false }, pathname);
    if (target) redirect(target);
    return (
      <SetupFrame user={card}>
        <OnboardingGate role={me.user.role} onboardingComplete={false}>
          {children}
        </OnboardingGate>
      </SetupFrame>
    );
  }

  const isStudent = me.user.role === "student";
  const enabled = isStudent ? enabledOptionalCrew(await listFacts(getDeps(), actor, actor.userId)) : [];
  const shared = isStudent ? [] : await parentShares(actor);
  const { tabs, more } = mobileTabsFor(me.user.role, enabled, shared);
  const topbar = (
    <Topbar
      search={isStudent ? { action: "/scholarships", placeholder: "Search scholarships, schools, essays…" } : undefined}
    >
      <NotificationBell timeZone={me.user.timeZone} />
      <Button variant="line" size="sm" href="/settings">
        Settings
      </Button>
      <Button variant="primary" icon="chat" href="/crew">
        Ask your crew
      </Button>
    </Topbar>
  );

  return (
    <ShellFrame
      nav={navFor(me.user.role, enabled, shared)}
      crew={rosterFor(enabled, me.user.role)}
      user={card}
      topbar={topbar}
      tabs={tabs}
      more={more}
    >
      {children}
    </ShellFrame>
  );
}
