"use client";

import { api, errorMessage } from "@/lib/api";
import { INCOME_OPTIONS, SENSITIVE_OPTIONS, SENSITIVE_ORDER, sensitiveValue } from "@/lib/sensitive";
import type { SensitiveFactInput, SensitiveFactSummary, SensitiveKind } from "@scholarcrew/domain";
import { Button, Card, Icon, Select, TextInput, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./memory.module.css";

function blank(kind: SensitiveKind): SensitiveFactSummary {
  return { kind, enabled: false, hasValue: false, displayValue: null, sharedByParent: false };
}

/** ME-05: sensitive matching facts. Off unless turned on; read only by the matcher. */
export function SensitiveToggles({ facts }: { facts: SensitiveFactSummary[] }) {
  const [byKind, setByKind] = useState<Record<SensitiveKind, SensitiveFactSummary>>(() => {
    const out = {} as Record<SensitiveKind, SensitiveFactSummary>;
    for (const kind of SENSITIVE_ORDER) out[kind] = facts.find((f) => f.kind === kind) ?? blank(kind);
    return out;
  });
  const [choosingIncome, setChoosingIncome] = useState(false);
  const [lists, setLists] = useState<Partial<Record<SensitiveKind, string>>>({});
  const [error, setError] = useState<string | null>(null);

  async function put(input: SensitiveFactInput) {
    const before = byKind[input.kind];
    setByKind((m) => ({ ...m, [input.kind]: { ...before, enabled: input.enabled } }));
    setError(null);
    try {
      const saved = await api<SensitiveFactSummary>("/sensitive-facts", { method: "PUT", body: input });
      setByKind((m) => ({ ...m, [input.kind]: saved }));
    } catch (e) {
      setByKind((m) => ({ ...m, [input.kind]: before }));
      setError(errorMessage(e));
    }
  }

  function flip(kind: SensitiveKind, enabled: boolean) {
    if (kind === "income_range") {
      if (enabled && !byKind[kind].hasValue) {
        setChoosingIncome(true);
        return;
      }
      setChoosingIncome(false);
    }
    void put({ kind, enabled, value: null });
  }

  return (
    <Card title="Only used to find scholarships" aside={<Icon name="lock" />}>
      <p className={styles.muted}>
        Off unless you turn it on. Used only by the matcher: never in AI prompts, never shown to schools, never shown to
        family; matches based on these details are visible only to you, never guessed.
      </p>
      {SENSITIVE_ORDER.map((kind) => {
        const s = byKind[kind];
        const option = SENSITIVE_OPTIONS[kind];
        const on = s.enabled || (kind === "income_range" && choosingIncome);
        const detail =
          s.sharedByParent && !s.enabled && kind === "income_range"
            ? "Your parent shared an income range. Turn it on to use it for matching."
            : s.displayValue
              ? `${s.displayValue}${s.sharedByParent ? " · shared by family" : ""}`
              : undefined;
        return (
          <div key={kind} className={styles.trow}>
            <Toggle checked={on} label={option.label} detail={detail} onChange={(next) => flip(kind, next)} />
            {kind === "income_range" && choosingIncome && !s.enabled ? (
              <Select
                label="Income range"
                placeholder="Pick a range"
                options={INCOME_OPTIONS}
                value=""
                onChange={(e) => {
                  const value = sensitiveValue("income_range", e.target.value);
                  if (value) {
                    setChoosingIncome(false);
                    void put({ kind, enabled: true, value });
                  }
                }}
              />
            ) : null}
            {option.value === "list" && s.enabled ? (
              <form
                className={styles.inline}
                onSubmit={(e) => {
                  e.preventDefault();
                  void put({ kind, enabled: true, value: sensitiveValue(kind, lists[kind] ?? "") });
                }}
              >
                <TextInput
                  label={`${option.label}: which ones? (optional)`}
                  value={lists[kind] ?? ""}
                  onChange={(e) => setLists((l) => ({ ...l, [kind]: e.target.value }))}
                />
                <Button variant="line" size="sm" type="submit">
                  Save
                </Button>
              </form>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
