import { ScholarshipEditor } from "@/components/admin/ScholarshipEditor";
import styles from "@/components/admin/admin.module.css";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { currentSeason } from "@scholarcrew/core/shared";

export const dynamic = "force-dynamic";

export default async function NewScholarshipPage() {
  await requirePageActor(["admin"]);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>New listing</h1>
          <p className={styles.sub}>New listings start as drafts. Publish them from the status card after saving.</p>
        </div>
      </div>
      <ScholarshipEditor listing={null} defaultCycle={currentSeason(getDeps().clock.now())} />
    </>
  );
}
