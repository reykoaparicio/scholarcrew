import { LabelLegend, SignupCard } from "@/components/public/ListingRow";
import styles from "@/components/public/directory.module.css";
import { amountLabel, deadlineLabel, describeRule, listingCheck } from "@/components/public/listings";
import { stateHref } from "@/components/public/states";
import { safeHref } from "@/lib/format";
import { dateShort, minutesLabel, plural } from "@/lib/format";
import { getDeps } from "@/server/deps";
import { getScholarship } from "@scholarcrew/core/scholarships";
import { PUBLIC_ACTOR, STATE_NAMES, type ScholarshipDetail, isAppError, localLabel } from "@scholarcrew/domain";
import { Badge, Button, Card, Icon } from "@scholarcrew/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Published, public, and scam-free, or null. generateMetadata and the page share one lookup per request. */
const loadListing = cache(async (slug: string): Promise<ScholarshipDetail | null> => {
  try {
    const s = await getScholarship(getDeps(), PUBLIC_ACTOR, slug);
    return s.scamFlags.length > 0 ? null : s;
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
});

/** Only http(s) links leave the site. */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await loadListing((await params).slug);
  if (!s) return { title: "Scholarship not found · ScholarCrew", robots: { index: false, follow: false } };
  const due = s.deadline ? `Deadline ${dateShort(s.deadline)}` : "Deadline not posted yet";
  return {
    title: `${s.name} · ${amountLabel(s)} · ScholarCrew`,
    description: `${s.provider}. ${localLabel(s.localArea)}. ${due}. Checked against its source, with the date we checked.`,
    alternates: { canonical: `/directory/s/${s.slug}` },
  };
}

export default async function ListingPage({ params }: Props) {
  const s = await loadListing((await params).slug);
  if (!s) notFound();
  const now = getDeps().clock.now();
  const check = listingCheck(
    {
      status: s.stale ? "stale" : s.status,
      verifiedAt: s.verifiedAt,
      unverified: s.verifiedAt === null || s.visibility === "submitter_only",
    },
    now,
  );
  const due = deadlineLabel(s.deadline, now);
  const rules = [...new Set(s.eligibility.map(describeRule))];
  const r = s.requirements;
  const needs = [
    ...r.essays.map((e) => (e.wordLimit ? `Essay (${e.wordLimit} words): ${e.prompt}` : `Essay: ${e.prompt}`)),
    ...(r.recommendations > 0 ? [plural(r.recommendations, "recommendation letter")] : []),
    ...(r.transcript ? ["Transcript"] : []),
    ...(r.serviceHours ? [`${r.serviceHours} service hours`] : []),
    ...r.other,
  ];
  const apply = safeHref(s.url);
  const source = safeHref(s.sourceUrl);
  const state = s.localArea.national ? null : s.localArea.state;
  return (
    <div className={styles.dir}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/directory">Directory</a>
        {state ? (
          <>
            <span aria-hidden="true">›</span>
            <a href={stateHref(state)}>{STATE_NAMES[state]}</a>
          </>
        ) : null}
        <span aria-hidden="true">›</span>
        <b>{s.name}</b>
      </nav>
      <div className={styles.head}>
        <div>
          <h1>{s.name}</h1>
          <p className={styles.sub}>{`From ${s.provider}`}</p>
        </div>
        <Badge tone={check.tone} icon={check.icon}>
          {check.label}
        </Badge>
      </div>
      <div className={styles.facts}>
        <div>
          <div className={styles.factK}>Amount</div>
          <div className={styles.factV}>{amountLabel(s)}</div>
          <div className={styles.factS}>{s.renewable ? "Renewable" : "One-time"}</div>
        </div>
        <div>
          <div className={styles.factK}>Deadline</div>
          <div className={styles.factV}>{due.main}</div>
          <div className={styles.factS}>{due.sub}</div>
        </div>
        <div>
          <div className={styles.factK}>Where</div>
          <div className={styles.factV}>{localLabel(s.localArea)}</div>
          <div className={styles.factS}>{s.localArea.national ? "Open nationwide" : "Local or state"}</div>
        </div>
        <div>
          <div className={styles.factK}>Time to apply</div>
          <div className={styles.factV}>{minutesLabel(s.estMinutes)}</div>
          <div className={styles.factS}>Our estimate</div>
        </div>
      </div>
      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          <Card title="Who can apply">
            <ul className={styles.bullets}>
              {rules.length === 0 ? (
                <li>
                  <Icon name="check" />
                  Open to students in the area above
                </li>
              ) : (
                rules.map((text) => (
                  <li key={text}>
                    <Icon name="check" />
                    {text}
                  </li>
                ))
              )}
            </ul>
          </Card>
          <Card title="What you'll need">
            <ul className={styles.bullets}>
              {needs.length === 0 ? (
                <li>
                  <Icon name="check" />
                  The application form
                </li>
              ) : (
                needs.map((text) => (
                  <li key={text}>
                    <Icon name="doc" />
                    {text}
                  </li>
                ))
              )}
            </ul>
          </Card>
          {s.renewable && s.renewalTerms ? (
            <Card title="Renewal">
              <p>{s.renewalTerms}</p>
            </Card>
          ) : null}
          <Card title="Source">
            <p className={styles.sub}>
              {check.detail ?? "Checked against the sponsor's page on the date shown above."}
            </p>
            <div className={styles.chips}>
              {apply ? (
                <Button variant="primary" iconEnd="ext" href={apply}>
                  Apply on the sponsor's site
                </Button>
              ) : null}
              {source ? (
                <Button variant="line" iconEnd="ext" href={source}>
                  Source page
                </Button>
              ) : null}
            </div>
            <p className={styles.fine}>Always confirm the deadline and rules on the sponsor's page before you apply.</p>
          </Card>
        </div>
        <aside className={styles.side}>
          <SignupCard />
          <LabelLegend />
        </aside>
      </div>
    </div>
  );
}
