import { CollegeImport } from "@/components/admin/CollegeImport";
import { ResearchForm } from "@/components/admin/ResearchForm";
import styles from "@/components/admin/admin.module.css";
import { requirePageActor } from "@/server/session";
import { Card } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function CollegesAdminPage() {
  await requirePageActor(["admin"]);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Colleges and research</h1>
          <p className={styles.sub}>
            Refresh college data from a College Scorecard extract, or ask the catalog to look for local scholarships.
          </p>
        </div>
      </div>
      <div className={styles.stack}>
        <Card title="Import from College Scorecard">
          <p className={styles.sub}>
            Columns: UNITID, INSTNM, CITY, STABBR, CONTROL, ADM_RATE, COSTT4_A, NPT4_PUB, NPT4_PRIV. Existing colleges
            are updated by UNITID. Up to 5 MB per import.
          </p>
          <CollegeImport />
        </Card>
        <Card title="Start research">
          <p className={styles.sub}>
            Research searches the web for scholarships in a state or county. Code checks every draft, and nothing is
            published until an admin reviews it.
          </p>
          <ResearchForm />
        </Card>
      </div>
    </>
  );
}
