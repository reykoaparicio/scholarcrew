import { CheckEmail } from "@/components/auth/CheckEmail";
import styles from "@/components/auth/auth.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check your email · ScholarCrew",
  robots: { index: false, follow: false },
};

/** No `?email=`: CheckEmail reads the address from sessionStorage, so it never lands in history or logs. */
export default function CheckEmailPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <CheckEmail />
      </div>
    </div>
  );
}
