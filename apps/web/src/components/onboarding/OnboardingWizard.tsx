"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import type { DocumentMeta, MeResponse } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SoFarPanel, UsesPanel, WhenYouFinish } from "./SidePanels";
import { Under13Notice } from "./Under13Notice";
import {
  DRAFT_KEY,
  type OnboardingDraft,
  STEP_TITLES,
  type StepErrors,
  type StepIndex,
  buildInput,
  draftForStorage,
  emptyDraft,
  isUnder13,
  restoreDraft,
  stepSummary,
  validateStep,
} from "./model";
import styles from "./onboarding.module.css";
import { AboutStep, CollegesStep, GradesStep, OptInsStep, UploadsStep } from "./steps";

const HEADLINES: Record<StepIndex, { h1: string; sub: string }> = {
  0: {
    h1: "Tell us about you",
    sub: "Your crew uses this to find local scholarships and plan around your deadlines. Each answer is saved as something you said.",
  },
  1: { h1: "Grades and interests", sub: "Optional, but it helps Scout match you and Quill find your stories." },
  2: {
    h1: "Choose what the matcher can use",
    sub: "Some scholarships are only for certain students, like first-generation college students or military families. Turn on only what you're comfortable sharing. You can skip this whole step.",
  },
  3: { h1: "Starter uploads", sub: "Add a transcript, a resume, or past essays. You can skip this and upload later." },
  4: {
    h1: "Colleges and family",
    sub: "Add up to 15 colleges you're thinking about, and invite a parent if you'd like.",
  },
};

const DEFAULT_HINTS = [
  "Name, school, where you live",
  "GPA and interests",
  "Optional · all start off",
  "Transcript, past essays",
  "Your list, invite a parent",
];

/** 06 F13 throws `forbidden` with `details: { reason: "underage" }` for the under-13 gate (R3A-17). */
function isUnderageBlock(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    e.code === "forbidden" &&
    (e.details as { reason?: string } | undefined)?.reason === "underage"
  );
}
const CONTINUE: Record<StepIndex, string> = {
  0: "Continue",
  1: "Continue to opt-ins",
  2: "Continue to uploads",
  3: "Continue to colleges",
  4: "Finish setup",
};

export function OnboardingWizard({
  initialName,
  initialTimeZone,
  nowIso,
}: {
  initialName: string;
  initialTimeZone: string;
  nowIso: string;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [step, setStep] = useState<StepIndex>(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    emptyDraft({ displayName: initialName, timeZone: initialTimeZone }),
  );
  const [errors, setErrors] = useState<StepErrors>({});
  const [uploads, setUploads] = useState<DocumentMeta[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let raw: string | null = null;
    try {
      // Read now: the save effect below runs in this same commit and would overwrite the stored draft.
      raw = window.localStorage.getItem(DRAFT_KEY);
    } catch {
      // Storage blocked: start fresh.
    }
    setDraft((d) => restoreDraft(raw, d));
  }, []);

  useEffect(() => {
    if (!restored.current || blocked) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftForStorage(draft)));
    } catch {
      // Storage blocked or full: the draft just isn't kept.
    }
  }, [draft, blocked]);

  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api<MeResponse>("/onboarding", { method: "POST", body: buildInput(draft) });
    } catch (e) {
      setSubmitting(false);
      // R3A-17: branch on codes, never the status number. Only 06's age gate carries reason "underage";
      // a CSRF 403 on this route must not show the under-13 block or clear the draft.
      if (isUnderageBlock(e)) {
        clearDraft();
        setBlocked(true);
        return;
      }
      if (e instanceof ApiError && e.code === "conflict") {
        // Setup already finished (another tab, or an earlier submit whose response was lost).
        clearDraft();
        router.push("/week");
        router.refresh();
        return;
      }
      setSubmitError(errorMessage(e));
      return;
    }
    clearDraft();
    const email = draft.parentEmail.trim();
    if (email) {
      try {
        await api("/family/invites", { method: "POST", body: { email } });
      } catch (e) {
        setInviteProblem(
          `Your crew is set up, but we couldn't send the invite: ${errorMessage(e)} You can invite a parent from Family.`,
        );
        setSubmitting(false);
        return;
      }
    }
    router.push("/week");
    router.refresh();
  }

  async function next() {
    const errs = validateStep(step, draft, now);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (step === 0 && isUnder13(Number(draft.birthYear), now)) {
      await submit();
      return;
    }
    if (step === 4) {
      await submit();
      return;
    }
    setStep((step + 1) as StepIndex);
  }

  function skip() {
    setErrors({});
    if (step === 2) update({ sensitive: emptyDraft({}).sensitive });
    setStep((step + 1) as StepIndex);
  }

  if (blocked) return <Under13Notice />;

  if (inviteProblem) {
    return (
      <Card padding="lg">
        <p>{inviteProblem}</p>
        <div className={styles.foot}>
          <Button variant="primary" href="/week">
            Go to This week
          </Button>
        </div>
      </Card>
    );
  }

  const head = HEADLINES[step];
  return (
    <>
      <ol className={styles.stepper}>
        {STEP_TITLES.map((title, n) => {
          const state = n < step ? "done" : n === step ? "now" : "later";
          return (
            <li key={title} className={cx(styles.stp, styles[state])} aria-current={n === step ? "step" : undefined}>
              <span className={styles.n}>{state === "done" ? <Icon name="check" /> : n + 1}</span>
              <span className={styles.l}>
                {title}
                <span>{state === "done" ? stepSummary(n as StepIndex, draft) : DEFAULT_HINTS[n]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.grid}>
        <Card padding="lg">
          <Eyebrow>{`Step ${step + 1} of 5 · ${STEP_TITLES[step]}`}</Eyebrow>
          <h1 className={styles.h1}>{head.h1}</h1>
          <p className={styles.sub}>{head.sub}</p>
          <div className={styles.body}>
            {step === 0 ? <AboutStep draft={draft} errors={errors} update={update} /> : null}
            {step === 1 ? <GradesStep draft={draft} errors={errors} update={update} /> : null}
            {step === 2 ? <OptInsStep draft={draft} errors={errors} update={update} /> : null}
            {step === 3 ? <UploadsStep uploads={uploads} onUploaded={(d) => setUploads((u) => [...u, d])} /> : null}
            {step === 4 ? <CollegesStep draft={draft} errors={errors} update={update} /> : null}
          </div>
          {submitError ? (
            <p className={styles.error} role="alert">
              {submitError}
            </p>
          ) : null}
          <div className={styles.foot}>
            {step > 0 ? (
              <Button variant="line" disabled={submitting} onClick={() => setStep((step - 1) as StepIndex)}>
                Back
              </Button>
            ) : null}
            <span className={styles.spacer} />
            {step >= 1 && step <= 3 ? (
              <Button variant="line" disabled={submitting} onClick={skip}>
                Skip this step
              </Button>
            ) : null}
            <Button variant="primary" iconEnd="arrow" disabled={submitting} onClick={() => void next()}>
              {submitting ? "Saving…" : CONTINUE[step]}
            </Button>
          </div>
        </Card>
        <div className={styles.side}>
          {step === 2 ? <UsesPanel /> : null}
          {step >= 1 ? <SoFarPanel draft={draft} /> : null}
          <WhenYouFinish />
        </div>
      </div>
    </>
  );
}
