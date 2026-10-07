"use client";

import { api, errorMessage } from "@/lib/api";
import { usd } from "@/lib/format";
import { INCOME_OPTIONS } from "@/lib/sensitive";
import type { FamilyBudget, IncomeRange } from "@scholarcrew/domain";
import { Button, Card, Icon, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

const MAX_BUDGET_USD = 500_000;

/**
 * R3V-3: whole dollars like 17's money inputs: "$12,000" and "12 000" are 12000. Anything else, an empty
 * result, or more than $500,000 is null.
 */
function parseDollars(text: string): number | null {
  const digits = text.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n <= MAX_BUDGET_USD ? n : null;
}

/** FA-04: a parent's private space. They can share a result (an income range) and a yearly budget. */
export function ParentSpace({
  studentId,
  studentName,
  budget,
}: {
  studentId: string | null;
  studentName: string;
  budget: FamilyBudget | null;
}) {
  const [range, setRange] = useState("");
  const [rangeStatus, setRangeStatus] = useState<string | null>(null);
  const [annual, setAnnual] = useState(budget ? String(budget.annualUsd) : "");
  const [budgetStatus, setBudgetStatus] = useState<string | null>(null);
  const name = studentName || "your student";

  async function shareRange() {
    if (!studentId || !range) return;
    setRangeStatus(null);
    try {
      await api("/sensitive-facts/share-income", { method: "POST", body: { studentId, range: range as IncomeRange } });
      setRangeStatus(`Shared with ${name}'s matching. They can turn it off in Memory.`);
    } catch (e) {
      setRangeStatus(errorMessage(e));
    }
  }

  async function saveBudget() {
    const n = parseDollars(annual);
    if (n === null) {
      setBudgetStatus("Enter whole dollars, up to $500,000.");
      return;
    }
    setBudgetStatus(null);
    try {
      const saved = await api<FamilyBudget>("/family/budget", { method: "PUT", body: { annualUsd: n } });
      setBudgetStatus(`Saved: ${usd(saved.annualUsd)} a year. Ledger uses it in the gap.`);
    } catch (e) {
      setBudgetStatus(errorMessage(e));
    }
  }

  return (
    <Card title="Your private space" aside={<Icon name="lock" />}>
      <p className={styles.small}>
        {`Tax returns, exact income, and your FAFSA details stay with you. ${name} sees only what you choose to share, like the income range used for matching.`}
      </p>
      <div className={styles.form}>
        <Select
          label="Household income range"
          placeholder="Pick a range"
          options={INCOME_OPTIONS}
          value={range}
          onChange={(e) => setRange(e.target.value)}
        />
        <Button variant="soft" size="sm" disabled={!studentId || !range} onClick={() => void shareRange()}>
          {`Share range with ${name}`}
        </Button>
        {rangeStatus ? <p className={styles.muted}>{rangeStatus}</p> : null}
      </div>
      <div className={styles.form}>
        <TextInput
          label="Yearly family budget for college"
          hint="What your family can put toward each year, in whole dollars"
          inputMode="numeric"
          value={annual}
          onChange={(e) => setAnnual(e.target.value)}
        />
        <Button variant="soft" size="sm" disabled={annual.trim() === ""} onClick={() => void saveBudget()}>
          Save budget
        </Button>
        {budgetStatus ? <p className={styles.muted}>{budgetStatus}</p> : null}
      </div>
    </Card>
  );
}
