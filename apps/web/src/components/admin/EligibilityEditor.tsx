"use client";

import { type EligibilityRule, type EligibilityRuleType, US_STATES } from "@scholarcrew/domain";
import { Badge, Button, Select, TextInput } from "@scholarcrew/ui";
import { useRef, useState } from "react";
import styles from "./admin.module.css";
import {
  INCOME_OPTIONS,
  RULE_SPECS,
  RULE_TYPES,
  type RuleDraft,
  type RuleFieldSpec,
  TEST_OPTIONS,
  draftToRule,
  draftsToRules,
  emptyDraft,
  isSensitiveRule,
  ruleToDraft,
} from "./eligibility";

const MAX_RULES = 20;
const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));
const TYPE_OPTIONS = RULE_TYPES.map((t) => ({ value: t, label: RULE_SPECS[t].label }));

function RuleField({ field, value, onChange }: { field: RuleFieldSpec; value: string; onChange: (v: string) => void }) {
  if (field.kind === "state" || field.kind === "income" || field.kind === "test") {
    const options = field.kind === "state" ? STATE_OPTIONS : field.kind === "income" ? INCOME_OPTIONS : TEST_OPTIONS;
    return <Select label={field.label} options={options} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <TextInput
      label={field.label}
      hint={field.hint}
      inputMode={field.kind === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** AD-02: one card per rule. Reports `{ rules, errors }` on every change; only valid rules are in `rules`. */
export function EligibilityEditor({
  initial,
  onChange,
}: {
  initial: EligibilityRule[];
  onChange: (out: { rules: EligibilityRule[]; errors: string[] }) => void;
}) {
  const counter = useRef(initial.length);
  const [drafts, setDrafts] = useState<RuleDraft[]>(() => initial.map((r, i) => ruleToDraft(`r${i}`, r)));
  const [addType, setAddType] = useState<EligibilityRuleType>("state_in");

  const update = (next: RuleDraft[]) => {
    setDrafts(next);
    onChange(draftsToRules(next));
  };
  const add = () => {
    counter.current += 1;
    update([...drafts, emptyDraft(`r${counter.current}`, addType)]);
  };
  const setValue = (key: string, name: string, value: string) =>
    update(drafts.map((d) => (d.key === key ? { ...d, values: { ...d.values, [name]: value } } : d)));

  return (
    <div className={styles.stack}>
      {drafts.length === 0 ? <p className={styles.sub}>No rules: open to everyone in the listing's area.</p> : null}
      {drafts.map((d, i) => {
        const spec = RULE_SPECS[d.type];
        const { error } = draftToRule(d);
        return (
          <div key={d.key} className={styles.ruleCard}>
            <div className={styles.ruleHead}>
              <b>{spec.label}</b>
              <span className={styles.row}>
                {isSensitiveRule(d.type) ? (
                  <Badge tone="navy" icon="lock">
                    Private match
                  </Badge>
                ) : null}
                <Button
                  variant="line"
                  size="sm"
                  aria-label={`Remove rule ${i + 1}`}
                  onClick={() => update(drafts.filter((x) => x.key !== d.key))}
                >
                  Remove
                </Button>
              </span>
            </div>
            {spec.fields.length > 0 ? (
              <div className={styles.formGrid}>
                {spec.fields.map((f) => (
                  <RuleField
                    key={f.name}
                    field={f}
                    value={d.values[f.name] ?? ""}
                    onChange={(v) => setValue(d.key, f.name, v)}
                  />
                ))}
              </div>
            ) : null}
            {isSensitiveRule(d.type) ? (
              <p className={styles.sub}>Students' answers stay encrypted. Only the matcher reads them.</p>
            ) : null}
            {error ? <p className={styles.alert}>{error}</p> : null}
          </div>
        );
      })}
      <div className={styles.row}>
        <Select
          label="Rule type"
          options={TYPE_OPTIONS}
          value={addType}
          onChange={(e) => setAddType(e.target.value as EligibilityRuleType)}
        />
        <Button variant="soft" icon="plus" disabled={drafts.length >= MAX_RULES} onClick={add}>
          Add rule
        </Button>
      </div>
    </div>
  );
}
