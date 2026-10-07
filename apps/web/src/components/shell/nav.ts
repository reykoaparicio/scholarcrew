import {
  CREW_ROLES,
  type MeResponse,
  type MemoryFact,
  type Role,
  SHARE_CATEGORIES,
  type ShareCategory,
  type ShareSettings,
} from "@scholarcrew/domain";
import type { CrewRosterItem, NavItem } from "@scholarcrew/ui";

export type OptionalCrew = "prep" | "impact";
export const OPTIONAL_CREW: OptionalCrew[] = ["prep", "impact"];
/** Confirmed fact (value true, visibility crew) that switches an optional teammate on (D29, D43). */
export const OPTIONAL_CREW_FACT: Record<OptionalCrew, string> = {
  prep: "crew_prep_enabled",
  impact: "crew_impact_enabled",
};
/** Where the sidebar "add" links go: the AddTeammate chips in the Crew side panel. */
export const ADD_TEAMMATE_HREF = "/crew#add-teammate";

type NavKey =
  | "week"
  | "crew"
  | "scholarships"
  | "essays"
  | "colleges"
  | "prep"
  | "impact"
  | "money"
  | "family"
  | "memory"
  | "settings";

const NAV_ITEMS: Record<NavKey, NavItem> = {
  week: { key: "week", label: "This week", href: "/week", icon: "calendar" },
  crew: { key: "crew", label: "Crew", href: "/crew", icon: "chat" },
  scholarships: { key: "scholarships", label: "Scholarships", href: "/scholarships", icon: "award" },
  essays: { key: "essays", label: "Essays", href: "/essays", icon: "pen" },
  colleges: { key: "colleges", label: "Colleges", href: "/colleges", icon: "columns" },
  prep: { key: "prep", label: "Test prep", href: "/prep", icon: "clock" },
  impact: { key: "impact", label: "Service", href: "/impact", icon: "spark" },
  money: { key: "money", label: "Money", href: "/money", icon: "dollar" },
  family: { key: "family", label: "Family", href: "/family", icon: "users" },
  memory: { key: "memory", label: "Memory", href: "/memory", icon: "bookmark" },
  settings: { key: "settings", label: "Settings", href: "/settings", icon: "info" },
};

const STUDENT_KEYS: NavKey[] = ["week", "crew", "scholarships", "essays", "colleges", "money", "family", "memory"];
const ALL_KEYS = Object.keys(NAV_ITEMS) as NavKey[];

/** Parents: This week, Crew chats (the family room), shared screens from plan 17, Colleges, Money, Family. */
function parentKeys(shared: ShareCategory[]): NavKey[] {
  const on = (c: ShareCategory) => shared.includes(c);
  const keys: NavKey[] = ["week", "crew"];
  if (on("scholarships")) keys.push("scholarships");
  if (on("essays") || on("stories")) keys.push("essays");
  keys.push("colleges");
  if (on("activities")) keys.push("impact");
  keys.push("money", "family");
  return keys;
}

function navKeysFor(role: Role, enabled: OptionalCrew[], shared: ShareCategory[]): NavKey[] {
  if (role === "parent") return parentKeys(shared);
  const extra = OPTIONAL_CREW.filter((r) => enabled.includes(r));
  const at = STUDENT_KEYS.indexOf("colleges") + 1;
  return [...STUDENT_KEYS.slice(0, at), ...extra, ...STUDENT_KEYS.slice(at)];
}

function itemFor(role: Role, key: NavKey, shared: ShareCategory[]): NavItem {
  if (role !== "parent") return NAV_ITEMS[key];
  if (key === "crew") return { ...NAV_ITEMS.crew, label: "Crew chats" };
  if (key === "essays" && !shared.includes("essays")) {
    return { ...NAV_ITEMS.essays, label: "Story Bank", href: "/essays/stories" };
  }
  return NAV_ITEMS[key];
}

/** Sidebar items. `shared` (parents only) is the student's shared categories from sharedCategoriesOf. */
export function navFor(role: Role, enabled: OptionalCrew[] = [], shared: ShareCategory[] = []): NavItem[] {
  return navKeysFor(role, enabled, shared).map((k) => itemFor(role, k, shared));
}

/** The categories switched on in a student's share settings, in SHARE_CATEGORIES order. */
export function sharedCategoriesOf(
  settings: (Pick<ShareSettings, "categories"> & Partial<ShareSettings>) | null,
): ShareCategory[] {
  if (!settings) return [];
  return SHARE_CATEGORIES.filter((c) => settings.categories[c] === true);
}

/** "/crew/abc" → "crew"; unknown first segments → "". */
export function activeKeyFor(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return (ALL_KEYS as string[]).includes(seg) ? seg : "";
}

/** Mockup 19: four tabs plus "More". */
export function mobileTabsFor(
  role: Role,
  enabled: OptionalCrew[],
  shared: ShareCategory[] = [],
): { tabs: NavItem[]; more: NavItem[] } {
  const keys = navKeysFor(role, enabled, shared);
  const tabs = keys.slice(0, 4);
  const more: NavKey[] = [...keys.slice(4), "settings"];
  return { tabs: tabs.map((k) => itemFor(role, k, shared)), more: more.map((k) => itemFor(role, k, shared)) };
}

export function enabledOptionalCrew(facts: Array<Pick<MemoryFact, "key" | "value" | "status">>): OptionalCrew[] {
  return OPTIONAL_CREW.filter((role) =>
    facts.some((f) => f.key === OPTIONAL_CREW_FACT[role] && f.status === "confirmed" && f.value === true),
  );
}

/** Fixed crew order; students' "add" links open the AddTeammate chips. Parents can't add teammates. */
export function rosterFor(enabled: OptionalCrew[], role: Role = "student"): CrewRosterItem[] {
  return CREW_ROLES.map((r) => {
    if (r === "prep" || r === "impact") {
      return { role: r, enabled: enabled.includes(r), addHref: role === "student" ? ADD_TEAMMATE_HREF : undefined };
    }
    return { role: r, enabled: true };
  });
}

export function displayNameOf(me: Pick<MeResponse, "user">): string {
  return me.user.displayName.trim() || me.user.email.split("@")[0] || "You";
}

export function userCard(me: MeResponse): { name: string; subtitle: string } {
  const name = displayNameOf(me);
  if (me.user.role === "parent") return { name, subtitle: me.family ? "Parent · Family" : "Parent" };
  if (me.user.role === "admin") return { name, subtitle: "Admin" };
  const year = me.profile?.classYear;
  return { name, subtitle: `${year ? `Class of ${year}` : "Student"} · Private` };
}

/** Students who haven't finished onboarding go to /onboarding from every other (app) page. */
export function onboardingRedirect(me: { role: Role; onboardingComplete: boolean }, pathname: string): string | null {
  if (me.role !== "student" || me.onboardingComplete) return null;
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return null;
  return "/onboarding";
}
