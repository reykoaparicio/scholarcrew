import { AppealButton } from "@/components/money/AppealButton";
import { OfferComparisonView } from "@/components/money/OfferComparisonView";
import { RemoveOfferButton, UploadLetter } from "@/components/money/UploadLetter";
import styles from "@/components/money/money.module.css";
import { OFFER_STATUS_LABEL } from "@/components/money/offers";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { plural, usd } from "@/lib/format";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { compareMyOffers, listOffers, loanEstimates } from "@scholarcrew/core/money";
import { currentAwardYear } from "@scholarcrew/core/shared";
import type { LoanEstimate } from "@scholarcrew/domain";
import { Badge, Button, Card } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="costs" />;
  const offers = await readShared(() => listOffers(v.deps, v.actor, studentId));
  if (!offers) return <NotShared studentName={v.studentName} what="costs" />;
  const comparison = await compareMyOffers(v.deps, v.actor, studentId);
  const confirmed = offers.filter((o) => o.status === "confirmed");
  const loans: Array<{ offerId: string; collegeName: string; estimates: LoanEstimate[] }> = await Promise.all(
    confirmed.map(async (o) => ({
      offerId: o.id,
      collegeName: o.collegeName,
      estimates: await loanEstimates(v.deps, v.actor, o.id),
    })),
  );
  const pending = offers.filter((o) => o.status !== "confirmed");
  const colleges = v.isParent
    ? []
    : ((await readShared(() => getCollegeList(v.deps, v.actor, studentId))) ?? []).map((e) => ({
        id: e.collegeId,
        name: e.college.name,
      }));

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Compare offers</h1>
          <p
            className={shared.sub}
          >{`${plural(offers.length, "award letter")} · Aid labeled every line · Ledger did the math`}</p>
        </div>
        <div className={shared.actions}>
          <Button variant="line" href="/money">
            Back to costs
          </Button>
        </div>
      </div>
      <div className={styles.stack}>
        <OfferComparisonView comparison={comparison} offers={offers} />
        {pending.length > 0 ? (
          <Card title="Letters in progress">
            <ul className={styles.items}>
              {pending.map((o) => (
                <li key={o.id}>
                  <span>{`${o.collegeName} · ${o.awardYear}`}</span>
                  <Badge tone={o.status === "failed" ? "crit" : o.status === "needs_review" ? "warn" : "neutral"}>
                    {OFFER_STATUS_LABEL[o.status]}
                  </Badge>
                  {o.status === "needs_review" ? <a href={`/money/offers/${o.id}`}>Review the lines</a> : <span />}
                  {/* R2P-8: a failed or unreviewed letter can be removed; confirmed letters stay for the season. */}
                  {!v.isParent && (o.status === "failed" || o.status === "needs_review") ? (
                    <RemoveOfferButton offerId={o.id} collegeName={o.collegeName} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {loans.some((l) => l.estimates.length > 0) ? (
          <Card title="Loan payments (10-year standard plan)">
            <ul className={styles.items}>
              {loans.flatMap((l) =>
                l.estimates.map((e) => (
                  <li key={`${l.offerId}:${e.label}`}>
                    <span>{`${l.collegeName} · ${e.label}`}</span>
                    <span>{`${usd(e.principalUsd)} at ${e.annualRatePct}% for ${e.years} years ≈ ${usd(e.monthlyUsd)}/month · ${usd(e.totalInterestUsd)} interest`}</span>
                  </li>
                )),
              )}
            </ul>
          </Card>
        ) : null}
        {v.isParent || confirmed.length === 0 ? null : (
          <Card title="Ask for more aid">
            <p className={styles.line}>
              Aid gives you the points, documents, and who to contact. You write the letter.
            </p>
            <div className={styles.appeals}>
              {confirmed.map((o) => (
                <AppealButton key={o.id} offerId={o.id} collegeName={o.collegeName} timeZone={v.timeZone} />
              ))}
            </div>
          </Card>
        )}
        {v.isParent ? null : <UploadLetter colleges={colleges} awardYear={currentAwardYear(v.deps.clock.now())} />}
      </div>
    </>
  );
}
