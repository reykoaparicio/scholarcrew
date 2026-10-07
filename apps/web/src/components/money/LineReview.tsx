"use client";

import { api, errorMessage } from "@/lib/api";
import { usd } from "@/lib/format";
import { OFFER_LINE_CATEGORIES, type OfferLine, type OfferLinePatch, type OfferWithLines } from "@scholarcrew/domain";
import { Badge, Button, Card, Select, TextInput, Toggle } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./money.module.css";
import { CATEGORY_LABEL } from "./offers";

const CATEGORY_OPTIONS = OFFER_LINE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }));
const READ_LABEL: Record<OfferLine["category"], string> = { ...CATEGORY_LABEL, work_study: "Federal work-study" };

function LineRow({
  line,
  editable,
  onPatch,
}: { line: OfferLine; editable: boolean; onPatch: (p: OfferLinePatch) => Promise<boolean> }) {
  const [amount, setAmount] = useState(String(line.amountUsd));
  const [showCite, setShowCite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAmount() {
    const cleaned = amount.replace(/[$,\s]/g, "");
    if (!/^\d+$/.test(cleaned) || Number(cleaned) > 200_000)
      return setError("Amounts are whole dollars up to $200,000.");
    setError(null);
    if (Number(cleaned) !== line.amountUsd) await onPatch({ amountUsd: Number(cleaned) });
  }

  return (
    <div className={styles.lineRow}>
      <div>
        <b>{line.label}</b>
        {line.userCorrected ? (
          <>
            {" "}
            <Badge tone="navy">You corrected this</Badge>
          </>
        ) : null}
        {line.page !== null ? (
          <button type="button" className={styles.chip} aria-expanded={showCite} onClick={() => setShowCite((s) => !s)}>
            {`p.${line.page}`}
          </button>
        ) : null}
        {showCite ? <p className={styles.cite}>{`From your letter, page ${line.page}: “${line.citedText}”`}</p> : null}
        {line.renewalCondition ? <p className={styles.line}>{line.renewalCondition}</p> : null}
      </div>
      {editable ? (
        <>
          <TextInput
            label={`${line.label} amount`}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => void saveAmount()}
          />
          <Select
            label={`${line.label} category`}
            options={CATEGORY_OPTIONS}
            value={line.category}
            onChange={(e) => void onPatch({ category: e.target.value as OfferLine["category"] })}
          />
          <Toggle
            label={`${line.label} renews`}
            checked={line.renewable}
            onChange={(renewable) => void onPatch({ renewable })}
          />
        </>
      ) : (
        <>
          <span>{usd(line.amountUsd)}</span>
          <span>{READ_LABEL[line.category]}</span>
          <span>{line.renewable ? "Renews" : "One-time"}</span>
        </>
      )}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** MO-05: the student checks every line Aid extracted before the offer counts; MO-07: page citations. */
export function LineReview({ offer, readOnly }: { offer: OfferWithLines; readOnly: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = !readOnly && offer.status === "needs_review";

  async function patch(id: string, p: OfferLinePatch): Promise<boolean> {
    setError(null);
    try {
      await api<OfferLine>(`/offer-lines/${id}`, { method: "PATCH", body: p });
      router.refresh();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/offers/${offer.id}/confirm`, { method: "POST" });
      router.push("/money/offers");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Card
      title={`${offer.collegeName} · ${offer.awardYear}`}
      aside={
        offer.costOfAttendanceUsd !== null ? (
          <span className={styles.line}>{`${usd(offer.costOfAttendanceUsd)} to attend`}</span>
        ) : null
      }
    >
      {offer.lines.length === 0 ? (
        <p className={styles.line}>No lines yet. Aid may still be reading this letter.</p>
      ) : null}
      {[...offer.lines]
        .sort((a, b) => a.position - b.position)
        .map((line) => (
          <LineRow key={line.id} line={line} editable={editable} onPatch={(p) => patch(line.id, p)} />
        ))}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {editable ? (
        <div className={shared.actions}>
          <Button
            variant="primary"
            icon="check"
            disabled={busy || offer.lines.length === 0}
            onClick={() => void confirm()}
          >
            Confirm these lines
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
