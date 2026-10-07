import { ScholarshipEditor } from "@/components/admin/ScholarshipEditor";
import styles from "@/components/admin/admin.module.css";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getScholarshipForAdmin } from "@scholarcrew/core/admin";
import { currentSeason } from "@scholarcrew/core/shared";
import { type Scholarship, isAppError } from "@scholarcrew/domain";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditScholarshipPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor(["admin"]);
  const deps = getDeps();
  // D36: any status; a bad or unknown id is not_found (the same call GET /admin/scholarships/:id wraps).
  let listing: Scholarship;
  try {
    listing = await getScholarshipForAdmin(deps, actor, (await params).id);
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  }
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>{listing.name}</h1>
          <p className={styles.sub}>{`${listing.provider} · /directory/s/${listing.slug}`}</p>
        </div>
      </div>
      <ScholarshipEditor listing={listing} defaultCycle={currentSeason(deps.clock.now())} />
    </>
  );
}
