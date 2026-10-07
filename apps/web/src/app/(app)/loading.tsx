import styles from "@/components/shell/shell.module.css";
import { Card } from "@scholarcrew/ui";

/** Shown while a server-rendered (app) page loads. */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Card>
        <p className={styles.gate}>Loading…</p>
      </Card>
    </div>
  );
}
