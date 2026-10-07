import { requireAppActor } from "@/lib/pageActor";
import { getFamily } from "@scholarcrew/core/family";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type MeResponse, type UserActor, isAppError } from "@scholarcrew/domain";

export interface Viewer {
  actor: UserActor;
  me: MeResponse;
  deps: CoreDeps;
  /** Whose records the page shows; null when a parent has no student in their family yet. */
  studentId: string | null;
  studentName: string;
  isParent: boolean;
  timeZone: string;
}

export async function loadViewer(): Promise<Viewer> {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const base = { actor, me, deps, timeZone: me.user.timeZone };
  if (me.user.role !== "parent") {
    return { ...base, studentId: actor.userId, studentName: me.user.displayName, isParent: false };
  }
  const family = await getFamily(deps, actor);
  const student = family?.members.find((member) => member.memberRole === "student");
  return { ...base, studentId: student?.userId ?? null, studentName: student?.displayName ?? "", isParent: true };
}

/** A not_found from a service (not shared, or not yours) becomes null so the page can explain it. */
export async function readShared<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

/** Today's calendar date in a time zone, falling back to UTC for an unknown zone. */
export function todayIn(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      now,
    );
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
