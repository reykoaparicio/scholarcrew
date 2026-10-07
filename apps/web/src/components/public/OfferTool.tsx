"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { OfferComparison, OfferLineCategory } from "@scholarcrew/domain";
import { Button, Select, TextInput, Toggle } from "@scholarcrew/ui";
import { type FormEvent, useRef, useState } from "react";
import { OfferResults } from "./OfferResults";
import styles from "./offerTool.module.css";
import {
  CATEGORY_OPTIONS,
  type LineDraft,
  MAX_LINES,
  MAX_OFFERS,
  type OfferDraft,
  buildOfferInput,
  newLine,
  newOffer,
} from "./offerToolState";

/** Plan 13 caps public bodies at 64 KB and answers 413 (`invalid_input`, status 413). */
export const TOO_BIG = "That's more than the tool can compare at once. Remove some lines or schools and try again.";

/** MO-11: type each award letter's lines, compare year 1 and 4 years. Nothing is stored; no AI. */
export function OfferTool() {
  const counter = useRef(3);
  const [offers, setOffers] = useState<OfferDraft[]>(() => [newOffer("o1"), newOffer("o2")]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<OfferComparison | null>(null);
  const [busy, setBusy] = useState(false);

  const nextKey = (prefix: string) => {
    counter.current += 1;
    return `${prefix}${counter.current}`;
  };
  const patchOffer = (key: string, patch: Partial<OfferDraft>) =>
    setOffers((all) => all.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const patchLine = (offerKey: string, lineKey: string, patch: Partial<LineDraft>) =>
    setOffers((all) =>
      all.map((o) =>
        o.key === offerKey ? { ...o, lines: o.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) } : o,
      ),
    );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const built = buildOfferInput(offers);
    if (!built.ok) {
      setErrors(built.errors);
      setResult(null);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      setResult(await api<OfferComparison>("/public/offer-tool", { body: built.input }));
    } catch (err) {
      setErrors([err instanceof ApiError && err.status === 413 ? TOO_BIG : errorMessage(err)]);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.tool}>
      <form onSubmit={submit} noValidate className={styles.form}>
        <div className={styles.offers}>
          {offers.map((o, i) => {
            const school = `School ${i + 1}`;
            return (
              <fieldset key={o.key} className={styles.offer}>
                <legend>{school}</legend>
                <TextInput
                  label="School name"
                  value={o.name}
                  onChange={(e) => patchOffer(o.key, { name: e.target.value })}
                />
                <TextInput
                  label="Cost of attendance per year"
                  inputMode="numeric"
                  placeholder="$28,000"
                  value={o.cost}
                  onChange={(e) => patchOffer(o.key, { cost: e.target.value })}
                />
                <ul className={styles.lines}>
                  {o.lines.map((l, j) => (
                    <li key={l.key} className={styles.line}>
                      <Select
                        label="Line type"
                        options={CATEGORY_OPTIONS}
                        value={l.category}
                        onChange={(e) => patchLine(o.key, l.key, { category: e.target.value as OfferLineCategory })}
                      />
                      <TextInput
                        label="Label"
                        placeholder="Pell Grant"
                        value={l.label}
                        onChange={(e) => patchLine(o.key, l.key, { label: e.target.value })}
                      />
                      <TextInput
                        label="Amount"
                        inputMode="numeric"
                        placeholder="$7,395"
                        value={l.amount}
                        onChange={(e) => patchLine(o.key, l.key, { amount: e.target.value })}
                      />
                      <Toggle
                        label="Renews each year"
                        checked={l.renewable}
                        onChange={(renewable) => patchLine(o.key, l.key, { renewable })}
                      />
                      {o.lines.length > 1 ? (
                        <Button
                          variant="line"
                          size="sm"
                          aria-label={`Remove line ${j + 1} from ${school}`}
                          onClick={() => patchOffer(o.key, { lines: o.lines.filter((x) => x.key !== l.key) })}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className={styles.row}>
                  <Button
                    variant="soft"
                    size="sm"
                    icon="plus"
                    disabled={o.lines.length >= MAX_LINES}
                    onClick={() => patchOffer(o.key, { lines: [...o.lines, newLine(nextKey(`${o.key}-l`))] })}
                  >
                    Add a line
                  </Button>
                  {offers.length > 1 ? (
                    <Button
                      variant="line"
                      size="sm"
                      aria-label={`Remove ${school}`}
                      onClick={() => setOffers((all) => all.filter((x) => x.key !== o.key))}
                    >
                      Remove school
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>
        {errors.length > 0 ? (
          <div role="alert" className={styles.errors}>
            <ul>
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={styles.row}>
          <Button
            variant="line"
            icon="plus"
            disabled={offers.length >= MAX_OFFERS}
            onClick={() => setOffers((all) => [...all, newOffer(nextKey("o"))])}
          >
            Add a school
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Comparing…" : "Compare offers"}
          </Button>
        </div>
      </form>
      {result ? <OfferResults comparison={result} /> : null}
    </div>
  );
}
