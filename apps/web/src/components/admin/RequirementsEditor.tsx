"use client";

import { Button, TextArea, TextInput, Toggle } from "@scholarcrew/ui";
import { useRef } from "react";
import styles from "./admin.module.css";
import type { EssayDraft, RequirementsForm } from "./listingForm";

export function RequirementsEditor({
  value,
  onChange,
}: { value: RequirementsForm; onChange: (next: RequirementsForm) => void }) {
  const counter = useRef(value.essays.length);
  const setEssay = (key: string, patch: Partial<EssayDraft>) =>
    onChange({ ...value, essays: value.essays.map((e) => (e.key === key ? { ...e, ...patch } : e)) });
  const addEssay = () => {
    counter.current += 1;
    onChange({ ...value, essays: [...value.essays, { key: `e${counter.current}`, prompt: "", wordLimit: "" }] });
  };
  return (
    <div className={styles.stack}>
      {value.essays.map((e, i) => (
        <div key={e.key} className={styles.ruleCard}>
          <div className={styles.ruleHead}>
            <b>{`Essay ${i + 1}`}</b>
            <Button
              variant="line"
              size="sm"
              aria-label={`Remove essay ${i + 1}`}
              onClick={() => onChange({ ...value, essays: value.essays.filter((x) => x.key !== e.key) })}
            >
              Remove
            </Button>
          </div>
          <TextArea
            label="Essay prompt"
            rows={3}
            value={e.prompt}
            onChange={(ev) => setEssay(e.key, { prompt: ev.target.value })}
          />
          <TextInput
            label="Word limit"
            hint="Leave blank if there's no limit"
            inputMode="numeric"
            value={e.wordLimit}
            onChange={(ev) => setEssay(e.key, { wordLimit: ev.target.value })}
          />
        </div>
      ))}
      <div className={styles.row}>
        <Button variant="soft" size="sm" icon="plus" disabled={value.essays.length >= 10} onClick={addEssay}>
          Add essay
        </Button>
      </div>
      <div className={styles.formGrid}>
        <TextInput
          label="Recommendation letters"
          inputMode="numeric"
          value={value.recommendations}
          onChange={(e) => onChange({ ...value, recommendations: e.target.value })}
        />
        <TextInput
          label="Service hours required"
          hint="Leave blank if none"
          inputMode="numeric"
          value={value.serviceHours}
          onChange={(e) => onChange({ ...value, serviceHours: e.target.value })}
        />
      </div>
      <Toggle
        label="Transcript required"
        checked={value.transcript}
        onChange={(transcript) => onChange({ ...value, transcript })}
      />
      <TextArea
        label="Other requirements"
        hint="One per line, like Resume"
        rows={3}
        value={value.other}
        onChange={(e) => onChange({ ...value, other: e.target.value })}
      />
    </div>
  );
}
