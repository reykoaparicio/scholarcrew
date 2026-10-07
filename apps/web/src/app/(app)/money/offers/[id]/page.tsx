import { LineReview } from "@/components/money/LineReview";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { getOffer } from "@scholarcrew/core/money";
import { Button } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OfferReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadViewer();
  const offer = await readShared(() => getOffer(v.deps, v.actor, id));
  if (!offer) notFound();
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Check your award letter</h1>
          <p className={shared.sub}>
            Aid read every line. Fix anything that's labeled wrong, then confirm so Ledger can compare it.
          </p>
        </div>
        <Button variant="line" href="/money/offers">
          Back to offers
        </Button>
      </div>
      <LineReview offer={offer} readOnly={v.isParent} />
    </>
  );
}
