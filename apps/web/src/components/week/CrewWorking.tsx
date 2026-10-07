"use client";

import { Card, StatusPill, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./week.module.css";

/** ON-06: shown while the first sweep and plan run; refreshes the page until they land. */
export function CrewWorking({
  intervalMs = 15_000,
  maxRefreshes = 40,
}: { intervalMs?: number; maxRefreshes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= maxRefreshes) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, maxRefreshes]);
  return (
    <Card>
      <div className={styles.working}>
        <StatusPill status="working" />
        <div>
          <h3>Your crew is working</h3>
          <p>
            <Who role="scout" /> is running your first scholarship sweep and <Who role="compass" /> is planning your
            first week. This page updates on its own, and the work keeps going if you close the tab.
          </p>
        </div>
      </div>
    </Card>
  );
}
