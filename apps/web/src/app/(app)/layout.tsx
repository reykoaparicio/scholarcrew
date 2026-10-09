import { NotificationBell } from "@/components/shell/NotificationBell";
import { OnboardingGate } from "@/components/shell/OnboardingGate";
import { SetupFrame } from "@/components/shell/SetupFrame";
import { ShellFrame } from "@/components/shell/ShellFrame";
import {
  OPTIONAL_CREW,
  OPTIONAL_CREW_FACT,
  type OptionalCrew,
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
import { getCollegeList } from "@scholarcrew/core/colleges";
import { listEssays } from "@scholarcrew/core/essays";
import { getFamily, getShareSettings } from "@scholarcrew/core/family";
import { listFacts, optionalCrewSwitches } from "@scholarcrew/core/memory";
import { getBoard } from "@scholarcrew/core/scholarships";
import type { ShareCategory, UserActor } from "@scholarcrew/domain";
import { Button, type NavItem, Topbar } from "@scholarcrew/ui";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A parent's view of their student: the shared categories (the nav only hides links, the pages still check,
 * E-16-2) and which optional teammates the student switched on, so both sidebars show the same crew.
 */
async function parentView(actor: UserActor): Promise<{ shared: ShareCategory[]; crew: OptionalCrew[] }> {
  const deps = getDeps();
  const family = await getFamily(deps, actor);
  const student = family?.members.find((member) => member.memberRole === "student");
  if (!student) return { shared: [], crew: [] };
  const [settings, switches] = await Promise.all([
    getShareSettings(deps, actor, student.userId),
    optionalCrewSwitches(deps, actor, student.userId).catch(() => []),
  ]);
  const crew = OPTIONAL_CREW.filter((role) => (switches as string[]).includes(OPTIONAL_CREW_FACT[role]));
  return { shared: sharedCategoriesOf(settings), crew };
}

/** Mockup 01's sidebar counts: open scholarships, unsubmitted essays, active colleges. Counts never block the shell. */
async function navCounts(actor: UserActor): Promise<Partial<Record<string, number>>> {
  const deps = getDeps();
  try {
    const [board, essays, colleges] = await Promise.all([
      getBoard(deps, actor, actor.userId),
      listEssays(deps, actor, actor.userId),
      getCollegeList(deps, actor, actor.userId),
    ]);
    return {
      scholarships: board.matched.length + board.working.length + board.submitted.length,
      essays: essays.filter((e) => e.status !== "submitted").length,
      colleges: colleges.length,
    };
  } catch {
    return {};
  }
}

function withCounts(nav: NavItem[], counts: Partial<Record<string, number>>): NavItem[] {
  return nav.map((item) => (counts[item.key] ? { ...item, count: counts[item.key] } : item));
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
  const parent = isStudent ? null : await parentView(actor);
  const enabled = isStudent ? enabledOptionalCrew(await listFacts(getDeps(), actor, actor.userId)) : [];
  const shared = parent?.shared ?? [];
  const counts = isStudent ? await navCounts(actor) : {};
  const { tabs, more } = mobileTabsFor(me.user.role, enabled, shared);
  const topbar = (
    <Topbar
      search={isStudent ? { action: "/scholarships", placeholder: "Search scholarships, schools, essays…" } : undefined}
    >
      <NotificationBell timeZone={me.user.timeZone} />
      {/* Phones reach these from the tab bar (Crew) and its More menu (Settings). */}
      <Button variant="line" size="sm" href="/settings" className="sc-hide-phone">
        Settings
      </Button>
      <Button variant="primary" icon="chat" href="/crew" className="sc-hide-phone">
        Ask your crew
      </Button>
    </Topbar>
  );

  return (
    <ShellFrame
      nav={withCounts(navFor(me.user.role, enabled, shared), counts)}
      crew={rosterFor(isStudent ? enabled : (parent?.crew ?? []), me.user.role)}
      user={card}
      topbar={topbar}
      tabs={tabs}
      more={more}
    >
      {children}
    </ShellFrame>
  );
}
