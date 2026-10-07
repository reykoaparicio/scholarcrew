"use client";

import { api } from "@/lib/api";
import type { BillingView } from "@scholarcrew/domain";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./settings.module.css";

export const BILLING_POLL_MS = 3000;
export const BILLING_MAX_POLLS = 5;

/**
 * After a successful checkout, checks GET /billing every `pollMs` (3 s), at most `maxPolls` (5) times, and
 * refreshes the page once the plan isn't "free". A failed check counts as one try. `pollMs` and `maxPolls`
 * exist for tests.
 */
export function BillingReturnNotice({
  status,
  pollMs = BILLING_POLL_MS,
  maxPolls = BILLING_MAX_POLLS,
}: {
  status: "success" | "cancel";
  pollMs?: number;
  maxPolls?: number;
}) {
  const router = useRouter();
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (status !== "success") return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      timer = null;
      tries += 1;
      try {
        const billing = await api<BillingView>("/billing");
        if (stopped) return;
        if (billing.subscription.plan !== "free") {
          stopped = true;
          setUpdated(true);
          router.refresh();
          return;
        }
      } catch {
        if (stopped) return;
      }
      if (tries < maxPolls) timer = setTimeout(() => void check(), pollMs);
    };
    timer = setTimeout(() => void check(), pollMs);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [status, pollMs, maxPolls, router]);

  const text =
    status === "cancel"
      ? "Checkout canceled."
      : updated
        ? "Payment received. Your plan is updated."
        : "Payment received. Your plan updates in a minute.";
  return <output className={styles.notice}>{text}</output>;
}
