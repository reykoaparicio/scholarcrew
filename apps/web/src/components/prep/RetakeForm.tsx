"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { usd } from "@/lib/format";
import type { College, CrewJob } from "@scholarcrew/domain";
import { retakeAnalysis } from "@scholarcrew/engines";
import { Button, Card, Chip, Select, Table, TextInput } from "@scholarcrew/ui";
import { type FormEvent, useState } from "react";
import { JobReply } from "../scholarships/JobReply";
import shared from "../scholarships/shared.module.css";
import { parseTarget } from "./prep";
import styles from "./prep.module.css";

export interface RetakeInputs {
  colleges: Array<Pick<College, "id" | "name" | "meritTiers">>;
  gpa: number | null;
  currentAct: number | null;
  currentSat: number | null;
}

const RANGE_TEXT = { ACT: "ACT targets run from 1 to 36.", SAT: "SAT targets run from 400 to 1600." } as const;

/**
 * PR-03: the job runs the same calculation in the worker and Prep explains it. The table here comes from
 * engines.retakeAnalysis over the inputs computeRetake uses (the job result isn't readable by actors).
 */
export function RetakeForm({ inputs, timeZone }: { inputs: RetakeInputs; timeZone: string }) {
  const [test, setTest] = useState<"ACT" | "SAT">(
    inputs.currentAct === null && inputs.currentSat !== null ? "SAT" : "ACT",
  );
  const [target, setTarget] = useState("");
  const [requested, setRequested] = useState<{ test: "ACT" | "SAT"; composite: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const current = test === "ACT" ? inputs.currentAct : inputs.currentSat;
  const step = test === "ACT" ? 1 : 50;
  const max = test === "ACT" ? 36 : 1600;
  const quick = current === null ? [] : [1, 2, 3].map((k) => current + k * step).filter((n) => n <= max);

  async function run(event: FormEvent) {
    event.preventDefault();
    const composite = parseTarget(test, target);
    setLimited(false);
    if (composite === null) return setError(RANGE_TEXT[test]);
    setError(null);
    setDone(false);
    try {
      const job = await api<CrewJob>("/prep/retake", { body: { test, targetComposite: composite } });
      setRequested({ test, composite });
      setJobId(job.id);
    } catch (e) {
      setError(errorMessage(e));
      setLimited(isLimit(e));
    }
  }

  const analysis = done && requested ? retakeAnalysis({ ...inputs, target: requested }) : null;
  const bestRow = analysis ? [...analysis.rows].sort((a, b) => b.fourYearDeltaUsd - a.fourYearDeltaUsd)[0] : undefined;
  return (
    <Card title="Is a retake worth it?">
      <p className={styles.note}>Merit tiers from each school's aid page · calculated by code</p>
      <form className={styles.row} onSubmit={run}>
        <Select
          label="Test"
          options={[
            { value: "ACT", label: "ACT" },
            { value: "SAT", label: "SAT" },
          ]}
          value={test}
          onChange={(e) => setTest(e.target.value as "ACT" | "SAT")}
        />
        <TextInput
          label="Target composite"
          inputMode="numeric"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        {quick.map((n) => (
          <Chip key={n} active={target === String(n)} onClick={() => setTarget(String(n))}>
            {String(n)}
          </Chip>
        ))}
        <Button variant="primary" type="submit" disabled={jobId !== null && !done}>
          Run the numbers
        </Button>
      </form>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {limited ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
      {analysis && requested ? (
        <>
          <Table
            caption="Retake value by school"
            rows={analysis.rows}
            rowKey={(r) => r.collegeId}
            columns={[
              { key: "school", header: "School", render: (r) => r.collegeName },
              {
                key: "now",
                header: analysis.currentComposite === null ? "Now" : `Now, at ${analysis.currentComposite}`,
                render: (r) => r.currentTierLabel ?? "No merit award",
              },
              { key: "then", header: `At a ${requested.composite}`, render: (r) => r.targetTierLabel ?? "No change" },
              {
                key: "year",
                header: "Per year",
                align: "right",
                render: (r) => (r.annualDeltaUsd > 0 ? `+${usd(r.annualDeltaUsd)}` : "$0"),
              },
              {
                key: "four",
                header: "Over 4 years",
                align: "right",
                render: (r) => (r.fourYearDeltaUsd > 0 ? `+${usd(r.fourYearDeltaUsd)}` : "$0"),
              },
            ]}
          />
          <p className={styles.callout}>
            {bestRow && bestRow.fourYearDeltaUsd > 0
              ? `You'll go to one school, so these don't add up. A ${requested.composite} is worth at most ${usd(bestRow.fourYearDeltaUsd)} over 4 years, at ${bestRow.collegeName}.`
              : `A ${requested.composite} doesn't unlock a bigger merit award at any school on your list.`}
          </p>
        </>
      ) : null}
      <JobReply
        jobId={jobId}
        workingText="Prep is running the numbers…"
        timeZone={timeZone}
        onDone={() => setDone(true)}
      />
    </Card>
  );
}
