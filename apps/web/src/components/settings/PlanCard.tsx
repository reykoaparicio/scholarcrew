"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { dateShort, instantShort } from "@/lib/format";
import type { BillingView, PlanId, Subscription } from "@scholarcrew/domain";
import { Badge, Button, Card, Progress, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./settings.module.css";

const PLANS: Array<{ id: PlanId; name: string; price: string; detail: string }> = [
  { id: "free", name: "Free", price: "$0", detail: "20 crew requests a month · matches, board, calendar, Story Bank" },
  { id: "family", name: "Family plan", price: "$12/mo", detail: "300 a month · 1 student and up to 2 parents" },
  {
    id: "season_pass",
    name: "Season pass",
    price: "$79 once",
    detail: "August to May · same limits as the Family plan",
  },
];

/** "2026-10" → "Nov 1": usage counters reset on the first of next month. */
export function resetLabel(month: string): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return dateShort(next);
}

export function PlanCard({
  billing,
  navigate = (url: string) => window.location.assign(url),
}: {
  billing: BillingView;
  navigate?: (url: string) => void;
}) {
  const router = useRouter();
  const { subscription: sub, usage } = billing;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const current = PLANS.find((p) => p.id === sub.plan) ?? PLANS[0];
  const left = Math.max(0, usage.limit - usage.crewRequests);
  const reset = resetLabel(usage.month);

  async function go(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(path, { method: "POST", body });
      navigate(url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function redeem() {
    setCodeStatus(null);
    try {
      await api<Subscription>("/billing/sponsor-code", { method: "POST", body: { code: code.trim() } });
      setCodeStatus("Code applied.");
      setCode("");
      router.refresh();
    } catch (e) {
      setCodeStatus(errorMessage(e));
    }
  }

  return (
    <Card
      title="Plan and usage"
      aside={sub.sponsor ? <Badge tone="navy">{`Sponsored by ${sub.sponsor}`}</Badge> : undefined}
    >
      <h2 className={styles.planName}>{current?.name}</h2>
      <p className={styles.muted}>
        {sub.plan === "free"
          ? "Free forever"
          : `${current?.price} (test price)${sub.currentPeriodEnd ? ` · ${sub.plan === "season_pass" ? "ends" : "renews"} ${instantShort(sub.currentPeriodEnd, "UTC")}` : ""}`}
        {sub.status === "past_due" ? " · payment past due" : ""}
      </p>
      <div className={styles.divider} />
      <div className={styles.usageRow}>
        <div>
          <p className={styles.setL}>Crew requests this month</p>
          <p className={styles.usageNum}>
            <span>{usage.crewRequests}</span> <small>{`of ${usage.limit}`}</small>
          </p>
        </div>
        <span className={styles.muted}>{`Resets ${reset}`}</span>
      </div>
      <Progress value={usage.limit > 0 ? usage.crewRequests / usage.limit : 1} label="Crew requests used this month" />
      <p className={styles.muted}>
        {`Used ${usage.crewRequests} · left ${left}. At ${usage.limit}, crew chat pauses until ${reset}. Your board, essays, calendar, and Memory keep working.`}
      </p>
      <div className={styles.divider} />
      <ul className={styles.plans}>
        {PLANS.map((p) => (
          <li key={p.id} className={cx(p.id === sub.plan && styles.cur)}>
            <b>
              {p.name} {p.id === sub.plan ? <Badge tone="navy">Current</Badge> : null}
            </b>
            <span className={styles.pp}>{p.price}</span>
            <span className={styles.pd}>{p.detail}</span>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>Test prices, not final.</p>
      <div className={styles.row}>
        {sub.managedByStripe ? (
          <Button variant="line" size="sm" disabled={busy} onClick={() => void go("/billing/portal")}>
            Manage billing
          </Button>
        ) : null}
        {sub.plan === "free" ? (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => void go("/billing/checkout", { plan: "family" })}
            >
              Get the Family plan
            </Button>
            <Button
              variant="line"
              size="sm"
              disabled={busy}
              onClick={() => void go("/billing/checkout", { plan: "season_pass" })}
            >
              Buy a season pass
            </Button>
          </>
        ) : null}
      </div>
      <p className={styles.lockline}>Paying for a plan doesn't unlock anyone's essays, chats, or sensitive facts.</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 4) void redeem();
        }}
      >
        <TextInput
          label="Sponsor code"
          hint="From your school or a nonprofit"
          value={code}
          maxLength={40}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button variant="line" size="sm" type="submit" disabled={code.trim().length < 4}>
          Redeem
        </Button>
      </form>
      {codeStatus ? <p className={styles.muted}>{codeStatus}</p> : null}
    </Card>
  );
}
