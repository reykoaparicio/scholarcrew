import { randomBytes } from "node:crypto";
import {
  and,
  blobs,
  collegeList,
  type colleges,
  documents,
  eq,
  scholarshipApplications,
  shareSettings,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import {
  type AppPlan,
  type AppStatus,
  type ApplicationStage,
  type DocumentKind,
  type ShareCategory,
  userActor,
} from "@scholarcrew/domain";
import { createTestDeps, fixedClock, one } from "../shared";

type Deps = ReturnType<typeof createTestDeps>;

export const NOW = "2026-10-06T15:00:00.000Z";
export const WEEK = "2026-10-05";
export const SEASON = "2026-27";
export const AWARD_YEAR = "2027-28";

/** Test deps on a movable clock at NOW (a Tuesday, 10:00 in America/Chicago). */
export function makeDeps() {
  const clock = fixedClock(NOW);
  return { deps: createTestDeps({ clock }), clock };
}

export async function makeStudent(deps: Deps, o: Parameters<typeof factories.student>[1] = {}) {
  const { user, profile } = await factories.student(deps.db, o);
  return { user, profile, actor: userActor(user.id, "student") };
}

/** A parent in one family with the student; share settings start at DEFAULT_SHARED. */
export async function makeParentOf(deps: Deps, studentId: string) {
  const parent = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [studentId], parentIds: [parent.id] });
  return { parent, family, actor: userActor(parent.id, "parent") };
}

export async function setShare(deps: Deps, studentId: string, category: ShareCategory, enabled: boolean) {
  await deps.db
    .update(shareSettings)
    .set({ enabled })
    .where(and(eq(shareSettings.studentId, studentId), eq(shareSettings.category, category)));
}

/** State U from the mockups: $27,800 to attend, $9,200 net price at $48k–75k, Early Action Nov 1. */
export async function makeStateU(deps: Deps, o: Partial<typeof colleges.$inferInsert> = {}) {
  return factories.college(deps.db, {
    id: "100001",
    name: "State U",
    costOfAttendanceUsd: 27800,
    netPriceByIncome: {
      overall: 12000,
      under_30k: 6500,
      "30_48k": 8000,
      "48_75k": 9200,
      "75_110k": 14000,
      over_110k: null,
    },
    deadlines: { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false },
    ...o,
  });
}

/** A college list row. `minutesAfter` orders rows added in one test. */
export async function listCollege(
  deps: Deps,
  ownerId: string,
  collegeId: string,
  o: { plan?: AppPlan; status?: AppStatus; season?: string; archivedAt?: Date; minutesAfter?: number } = {},
) {
  const createdAt = new Date(new Date(NOW).getTime() + (o.minutesAfter ?? 0) * 60_000);
  return one(
    await deps.db
      .insert(collegeList)
      .values({
        ownerId,
        collegeId,
        fit: "target",
        plan: o.plan ?? "RD",
        status: o.status ?? "applying",
        season: o.season ?? SEASON,
        archivedAt: o.archivedAt ?? null,
        createdAt,
      })
      .returning(),
    "college_list insert",
  );
}

/** A published scholarship plus the student's application row for it. */
export async function saveApp(
  deps: Deps,
  ownerId: string,
  o: {
    stage?: ApplicationStage;
    amountUsd?: number;
    deadline?: string | null;
    name?: string;
    outcomeUsd?: number | null;
    outcomeRenewable?: boolean | null;
    outcomeAt?: Date | null;
  } = {},
) {
  const amount = o.amountUsd ?? 1000;
  const scholarship = await factories.scholarship(deps.db, {
    name: o.name ?? "Test Scholarship",
    amountMinUsd: amount,
    amountMaxUsd: amount,
    deadline: o.deadline === undefined ? "2026-11-15" : o.deadline,
  });
  const application = one(
    await deps.db
      .insert(scholarshipApplications)
      .values({
        ownerId,
        scholarshipId: scholarship.id,
        stage: o.stage ?? "planned",
        outcomeUsd: o.outcomeUsd ?? null,
        outcomeRenewable: o.outcomeRenewable ?? null,
        outcomeAt: o.outcomeAt ?? null,
      })
      .returning(),
    "scholarship_applications insert",
  );
  return { scholarship, application };
}

/** An uploaded document row over a throwaway encrypted blob. */
export async function makeDocument(deps: Deps, ownerId: string, kind: DocumentKind = "award_letter") {
  const blob = one(
    await deps.db
      .insert(blobs)
      .values({ ciphertext: randomBytes(32), iv: randomBytes(12), tag: randomBytes(16) })
      .returning(),
    "blobs insert",
  );
  return one(
    await deps.db
      .insert(documents)
      .values({
        ownerId,
        kind,
        filename: "state-u-award.pdf",
        mime: "application/pdf",
        sizeBytes: 2048,
        blobId: blob.id,
      })
      .returning(),
    "documents insert",
  );
}
