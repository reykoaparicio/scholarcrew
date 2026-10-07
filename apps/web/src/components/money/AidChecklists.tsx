"use client";

import { api, errorMessage } from "@/lib/api";
import { safeHref } from "@/lib/format";
import { dateShort } from "@/lib/format";
import type { AidChecklist, AidChecklistItem, AidDeadline } from "@scholarcrew/domain";
import { Button, Card, Icon, Toggle } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./money.module.css";

/** AID-01/AID-02 step lists (parent steps also show as family tasks) and AID-03 state deadlines. */
export function AidChecklists({
  checklists,
  deadlines,
  readOnly,
}: {
  checklists: AidChecklist[];
  deadlines: AidDeadline[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function setDone(item: AidChecklistItem, done: boolean) {
    setError(null);
    try {
      await api<AidChecklistItem>(`/aid/items/${item.id}`, {
        method: "PATCH",
        body: { status: done ? "done" : "todo" },
      });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.stack}>
      {checklists.map((list) => (
        <Card
          key={`${list.program}:${list.collegeId ?? "all"}`}
          title={
            list.program === "fafsa" ? `FAFSA · ${list.awardYear}` : `CSS Profile · ${list.collegeName ?? "college"}`
          }
          aside={<span className={styles.line}>{`${list.doneCount} of ${list.totalCount} done`}</span>}
        >
          {list.items.map((item) => (
            <Toggle
              key={item.id}
              label={item.title}
              detail={[
                item.assignee === "parent" ? "Parent step" : null,
                item.dueOn ? `due ${dateShort(item.dueOn)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              checked={item.status === "done"}
              disabled={readOnly}
              onChange={(checked) => void setDone(item, checked)}
            />
          ))}
        </Card>
      ))}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {deadlines.length > 0 ? (
        <Card title="State aid deadlines">
          <ul className={styles.items}>
            {deadlines.map((d) => (
              <li key={d.id}>
                <div>
                  <div>{d.program}</div>
                  <div className={styles.line}>{d.note}</div>
                </div>
                <span>{d.deadline ? dateShort(d.deadline) : "No fixed date"}</span>
                {safeHref(d.sourceUrl) ? (
                  <a
                    href={safeHref(d.sourceUrl) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Source for ${d.program}`}
                  >
                    <Icon name="ext" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

const REVIEW_STEPS = [
  "File the FAFSA (and CSS Profile, if a school asks) as usual, with the tax year it asks for.",
  "Email or call each school's financial aid office and ask for a special circumstances (professional judgment) review.",
  "Send the documents the office asks for, then follow up if you don't hear back within two weeks.",
];
const REVIEW_DOCS = [
  "A letter from a parent explaining what changed and when",
  "A layoff or termination letter, or proof of fewer hours",
  "Recent pay stubs or unemployment benefit statements",
  "Bills for large medical or care costs",
  "Divorce, separation, or death records, if one applies",
];
const VERIFY_DOCS = [
  "The school's verification worksheet, filled out and signed",
  "IRS tax return transcripts (or signed tax returns) for you and your parents",
  "W-2 forms for everyone who worked",
  "Proof of household size and how many are in college, if the worksheet asks",
  "Proof of identity or high school completion, if the school asks",
];

function HelpCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Card title={title}>{children}</Card>
    </section>
  );
}

/**
 * AID-04: how to ask for a review when family finances change, and what to gather.
 * AID-05: the usual verification documents. Aid tracks them as plan items from chat (the ask link); there's no stored
 * verification checklist yet (see Deviations).
 */
export function AidHelpCards({ readOnly }: { readOnly: boolean }) {
  return (
    <div className={styles.stack}>
      <HelpCard title="Family finances changed?">
        <p className={styles.line}>
          A job loss, a big medical bill, or a divorce after you filed can change your aid. Schools can adjust it
          through a professional judgment review, but only if you ask.
        </p>
        <ol className={styles.steps}>
          {REVIEW_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h4 className={styles.line}>Documents to gather</h4>
        <ul className={styles.steps}>
          {REVIEW_DOCS.map((doc) => (
            <li key={doc}>{doc}</li>
          ))}
        </ul>
        {readOnly ? null : (
          <Button
            variant="soft"
            size="sm"
            icon="chat"
            href={`/crew?prefill=${encodeURIComponent("@Aid my family's finances changed. How do I ask my schools for a review, and what should I gather?")}`}
          >
            Ask Aid about a review
          </Button>
        )}
      </HelpCard>
      <HelpCard title="Selected for verification?">
        <p className={styles.line}>
          A school may ask you to confirm what's on your FAFSA. Watch your StudentAid.gov account and each school's
          portal, then send what the school asks for by its deadline. Aid isn't released until verification is done.
        </p>
        <ul className={styles.steps}>
          {VERIFY_DOCS.map((doc) => (
            <li key={doc}>{doc}</li>
          ))}
        </ul>
        {readOnly ? null : (
          <Button
            variant="soft"
            size="sm"
            icon="chat"
            href={`/crew?prefill=${encodeURIComponent("@Aid I was selected for verification. Help me list what my school asked for and add the steps to my plan.")}`}
          >
            Ask Aid to track it
          </Button>
        )}
      </HelpCard>
    </div>
  );
}
