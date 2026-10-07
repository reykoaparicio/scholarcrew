import { OfferTool } from "@/components/public/OfferTool";
import styles from "@/components/public/offerTool.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare award letters · ScholarCrew",
  description:
    "Type the lines from each college's award letter and see the year-1 and 4-year cost. No account, nothing saved, no AI.",
};

export default function OfferToolPage() {
  return (
    <div className={styles.page}>
      <h1>Compare award letters</h1>
      <p className={styles.intro}>
        Type the lines from each college's award letter: grants, scholarships, work-study, and loans. We separate free
        money from money you earn or pay back, and show what each school really costs for year 1 and for 4 years. No
        account needed. Nothing you type is saved, and no AI is used.
      </p>
      <OfferTool />
    </div>
  );
}
