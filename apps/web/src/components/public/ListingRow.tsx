import type { ScholarshipSummary } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Eyebrow } from "@scholarcrew/ui";
import styles from "./directory.module.css";
import { type DirectoryFilters, amountLabel, deadlineLabel, filterHref, listingCheck } from "./listings";

export function ListingRow({ s, now }: { s: ScholarshipSummary; now: Date }) {
  const check = listingCheck(s, now);
  const due = deadlineLabel(s.deadline, now);
  return (
    <li className={styles.row}>
      <div className={styles.amt}>
        {amountLabel(s)}
        <span>{s.renewable ? "Renewable" : "One-time"}</span>
      </div>
      <div>
        <a className={styles.name} href={`/directory/s/${encodeURIComponent(s.slug)}`}>
          {s.name}
        </a>
        <div className={styles.meta}>{`${s.provider} · ${s.localLabel}`}</div>
      </div>
      <div className={styles.due}>
        {due.main}
        <span>{due.sub}</span>
      </div>
      <div className={styles.check}>
        <Badge tone={check.tone} icon={check.icon}>
          {check.label}
        </Badge>
        {check.detail ? <span className={styles.detail}>{check.detail}</span> : null}
      </div>
    </li>
  );
}

export function ResultsCard({
  items,
  page,
  pageSize,
  total,
  base,
  filters,
  now,
}: {
  items: ScholarshipSummary[];
  page: number;
  pageSize: number;
  total: number;
  base: string;
  filters: DirectoryFilters;
  now: Date;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className={styles.results}>
      <div className={styles.resHead}>
        <span>Sorted by deadline, soonest first</span>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No listings match these filters yet." icon="search">
          Try fewer filters, or check back after the next catalog update.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {items.map((s) => (
            <ListingRow key={s.id} s={s} now={now} />
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav className={styles.pager} aria-label="Pages">
          <span>{`Page ${page} of ${pages}`}</span>
          <span className={styles.pagerLinks}>
            {page > 1 ? (
              <Button variant="line" size="sm" href={filterHref(base, filters, { page: page - 1 })}>
                Previous
              </Button>
            ) : null}
            {page < pages ? (
              <Button variant="line" size="sm" href={filterHref(base, filters, { page: page + 1 })}>
                Next
              </Button>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}

export function SignupCard() {
  return (
    <div className={styles.signup}>
      <Eyebrow>Free account</Eyebrow>
      <h3>See which of these you actually qualify for</h3>
      <p>
        Scout checks each rule against your profile and tells you why you match, like "you live in Maple County." Then
        Compass fits the best ones into your week.
      </p>
      <Button variant="white" iconEnd="arrow" href="/sign-in">
        Start free
      </Button>
      <p className={styles.signupFine}>No credit card · ages 13 and up · we never sell your data</p>
    </div>
  );
}

export function LabelLegend() {
  return (
    <Card title="What the labels mean">
      <ul className={styles.legend}>
        <li>
          <Badge tone="good" icon="check">
            Verified
          </Badge>
          <span>Matches its source, checked in the last 30 days</span>
        </li>
        <li>
          <Badge tone="warn" icon="clock">
            Stale
          </Badge>
          <span>Changed, or checked more than 30 days ago</span>
        </li>
        <li>
          <Badge tone="neutral" icon="info">
            Unverified
          </Badge>
          <span>Not confirmed yet</span>
        </li>
      </ul>
      <p className={styles.fine}>
        See a mistake? <a href="/sign-in">Sign in</a> to report a listing or suggest a local scholarship.
      </p>
    </Card>
  );
}
