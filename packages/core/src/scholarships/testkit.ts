import { and, eq, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type ShareCategory, userActor } from "@scholarcrew/domain";
import { type CoreDeps, createTestDeps, fixedClock } from "../shared";

export const NOW = "2026-10-06T15:00:00.000Z";
export type Mail = { to: string; subject: string; text: string };

/** Test deps with a fixed clock and an in-memory mailbox. */
export function setup() {
  const clock = fixedClock(NOW);
  const mails: Mail[] = [];
  const deps = createTestDeps({
    clock,
    email: {
      send: async (m) => {
        mails.push(m);
      },
    },
  });
  return { deps, clock, mails };
}

export async function makeStudent(deps: CoreDeps, o: Parameters<typeof factories.student>[1] = {}) {
  const { user, profile } = await factories.student(deps.db, o);
  return { user, profile, actor: userActor(user.id, "student") };
}

/** A parent in one family with the student; share settings start at DEFAULT_SHARED. */
export async function makeParentOf(deps: CoreDeps, studentId: string) {
  const parent = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [studentId], parentIds: [parent.id] });
  return { parent, family, actor: userActor(parent.id, "parent") };
}

export async function setShare(deps: CoreDeps, studentId: string, category: ShareCategory, enabled: boolean) {
  await deps.db
    .update(shareSettings)
    .set({ enabled })
    .where(and(eq(shareSettings.studentId, studentId), eq(shareSettings.category, category)));
}
