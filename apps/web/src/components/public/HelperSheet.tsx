import { dateShort, daysLabel } from "@/lib/format";
import { APPLICATION_STAGE_LABELS, APP_PLAN_LABELS, ApplicationStage } from "@scholarcrew/domain";
import type { AppStatus, HelperView } from "@scholarcrew/domain";
import { Badge, Card, EmptyState, Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import { Brand } from "./PublicChrome";
import { calendarLong, instantLong } from "./dates";
import styles from "./helper.module.css";

/** R3V-8: one label map per enum, from 02. Both are `Record<Enum, string>`, so a new value fails `tsc`. */
const PLAN_LABELS = APP_PLAN_LABELS;
const STAGE_LABELS = APPLICATION_STAGE_LABELS;

/**
 * `HelperView.scholarships[].stage` is typed `string` in 02 B7, so it's narrowed before the lookup.
 * Every value 07 writes is an `ApplicationStage`; the raw value is only a type-level fallback.
 */
export function stageLabel(stage: string): string {
  const parsed = ApplicationStage.safeParse(stage);
  return parsed.success ? STAGE_LABELS[parsed.data] : stage;
}

const STATUS_LABELS: Record<AppStatus, string> = {
  researching: "Researching",
  applying: "Applying",
  submitted: "Submitted",
  admitted: "Admitted",
  waitlisted: "Waitlisted",
  denied: "Denied",
  enrolled: "Enrolled",
  withdrawn: "Withdrawn",
};

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "your student";
}

/** [9, 10, 11, 12] → "grades 9–12"; [11] → "grade 11"; [9, 11] → "grades 9, 11". */
export function gradesLabel(grades: number[]): string {
  const g = [...grades].sort((a, b) => a - b);
  const lo = g[0];
  const hi = g[g.length - 1];
  if (lo === undefined || hi === undefined) return "";
  if (g.length === 1) return `grade ${lo}`;
  const consecutive = g.every((n, i) => i === 0 || n === (g[i - 1] ?? n) + 1);
  return consecutive ? `grades ${lo}–${hi}` : `grades ${g.join(", ")}`;
}

function greeting(view: HelperView, name: string): string {
  if (view.helperRole === "counselor") return `Hi ${view.label}. Here's where ${name}'s applications stand.`;
  if (view.helperRole === "mentor") return `Hi ${view.label}. Here's what ${name} shared with you.`;
  return `Hi ${view.label}. Here's ${name}'s brag sheet.`;
}

function Section({
  title,
  aside,
  empty,
  children,
}: { title: string; aside?: string; empty: boolean; children: ReactNode }) {
  return (
    <Card title={title} aside={aside ? <span className={styles.muted}>{aside}</span> : undefined}>
      {empty ? <p className={styles.muted}>Nothing shared here yet.</p> : children}
    </Card>
  );
}

export function HelperSheet({ view, nowIso }: { view: HelperView; nowIso: string }) {
  const name = firstName(view.studentName);
  const daysLeft = Math.ceil((Date.parse(view.expiresAt) - Date.parse(nowIso)) / 86_400_000);
  const soon = daysLeft <= 3;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Brand />
        <span className={styles.shared}>{`Helper link · shared by ${view.studentName}`}</span>
        <span className={styles.spacer} />
        <Badge tone="neutral" icon="lock">
          Read-only
        </Badge>
        <Badge tone={soon ? "warn" : "neutral"} icon="clock">
          {soon ? `Expires in ${daysLabel(Math.max(daysLeft, 0))}` : `Expires ${instantLong(view.expiresAt)}`}
        </Badge>
      </header>
      <main id="main" className={styles.main}>
        <div className={styles.banner}>
          <span className={styles.avatar} aria-hidden="true">
            {name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1>{greeting(view, name)}</h1>
            <p className={styles.sub}>
              {`${view.studentName} made this read-only page for you. No account needed. It stops working on ${instantLong(view.expiresAt)}.`}
            </p>
          </div>
        </div>
        <div className={styles.grid}>
          <div className={styles.col}>
            {view.request.message || view.request.dueDate ? (
              <Card title={`What ${name} is asking for`}>
                {view.request.message ? <p className={styles.desc}>{`“${view.request.message}”`}</p> : null}
                {view.request.dueDate ? (
                  <p className={styles.muted}>{`Helpful by ${calendarLong(view.request.dueDate)}`}</p>
                ) : null}
              </Card>
            ) : null}
            {view.activities ? (
              <Section title="Activities" aside={`As ${name} wrote them`} empty={view.activities.length === 0}>
                <ul className={styles.list}>
                  {view.activities.map((a) => (
                    <li key={a.id} className={`${styles.item} ${styles.activity}`}>
                      <div>
                        <b>{a.name}</b>
                        <div className={styles.muted}>
                          {[
                            a.role,
                            a.organization,
                            gradesLabel(a.grades),
                            a.hoursPerWeek > 0 ? `${a.hoursPerWeek} h/wk` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <p className={styles.desc}>{a.description}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {view.deadlines ? (
              <Section title="Deadlines" empty={view.deadlines.length === 0}>
                <ul className={styles.list}>
                  {view.deadlines.map((d) => (
                    <li key={`${d.refType}:${d.refId}:${d.title}`} className={styles.row}>
                      <b>{d.title}</b>
                      <span className={styles.muted}>{`${dateShort(d.dueOn)} · ${daysLabel(d.daysLeft)}`}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {view.colleges ? (
              <Section title="College list" empty={view.colleges.length === 0}>
                <ul className={styles.list}>
                  {view.colleges.map((c) => (
                    <li key={c.id} className={styles.row}>
                      <b>{c.college.name}</b>
                      <span className={styles.muted}>
                        {`${PLAN_LABELS[c.plan]} · ${STATUS_LABELS[c.status]} · ${c.itemsDone} of ${c.itemsTotal} items done`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
          <div className={styles.col}>
            {view.stories ? (
              <Section title={`Stories ${name} chose to share`} empty={view.stories.length === 0}>
                <ul className={styles.list}>
                  {view.stories.map((s) => (
                    <li key={s.title} className={styles.item}>
                      <b>{s.title}</b>
                      <p className={styles.desc}>{s.summary}</p>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted}>{`These are short summaries in ${name}'s words, not essays.`}</p>
              </Section>
            ) : null}
            {view.scholarships ? (
              <Section title="Scholarships" empty={view.scholarships.length === 0}>
                <ul className={styles.list}>
                  {view.scholarships.map((s) => (
                    <li key={s.name} className={styles.row}>
                      <b>{s.name}</b>
                      <span className={styles.muted}>
                        {`${stageLabel(s.stage)}${s.deadline ? ` · due ${dateShort(s.deadline)}` : ""}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            <Card title="Not in this link" aside={<Icon name="lock" />}>
              <ul className={styles.nolist}>
                {[
                  "Essays and drafts",
                  "Crew chats",
                  "Costs, aid, and family finances",
                  "Private or sensitive details",
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p
                className={styles.muted}
              >{`${name} can see when this link was opened and can turn it off at any time.`}</p>
            </Card>
          </div>
        </div>
      </main>
      <footer className={styles.foot}>
        <span>{`Questions? Reply to ${name}'s request email.`}</span>
        <a href="/privacy">Privacy policy</a>
        <a href="/terms">Terms</a>
      </footer>
    </div>
  );
}

/** Shown instead of the sheet for dead links (not-found.tsx) and rate limits. */
export function HelperUnavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className={styles.gone}>
      <div>
        <EmptyState title={title} icon="lock">
          {children}
        </EmptyState>
      </div>
    </main>
  );
}
