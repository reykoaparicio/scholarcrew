import { runOfferParse } from "@scholarcrew/agents/specialists";
import { readDocumentBytes } from "@scholarcrew/core/documents";
import { getOffer, markOfferFailed, saveParsedOffer } from "@scholarcrew/core/money";
import { and, eq, offers } from "@scholarcrew/db";
import type { CrewReply } from "@scholarcrew/domain";
import { JobPayloads } from "@scholarcrew/jobs";
import { type JobContext, NO_RETRY, type WorkerDeps } from "../types";
import { SYSTEM, runCrewJob } from "./shared";

// R2P-8: no route creates offer lines, so failures point at a PDF re-upload or the public offer tool.
export const NOT_PDF_TEXT =
  "Only PDF award letters can be read. Upload the letter as a PDF, or compare it by hand in the offer tool.";
export const PARSE_FAILED_TEXT =
  "We couldn't read that letter. Upload a clearer PDF, or compare it by hand in the offer tool.";
export const NO_LETTER_TEXT =
  "That file doesn't look like an award letter. Upload the letter as a PDF, or compare it by hand in the offer tool.";

export function offerReply(offerId: string, collegeName: string, lineCount: number): CrewReply {
  return {
    text: `Aid read your ${collegeName} award letter and found ${lineCount} ${lineCount === 1 ? "line" : "lines"}. Check each one before it counts.`,
    contributors: ["aid"],
    question: null,
    actionCards: [
      { kind: "open_link", id: "review-offer", label: "Review the lines", href: `/money/offers/${offerId}` },
    ],
    receipt: [],
    safety: null,
    needsInput: false,
  };
}

/** MO-04: Aid reads the PDF; the student reviews every line before it counts (MO-05, plan 08). */
export async function handleOfferParse(deps: WorkerDeps, data: unknown, ctx: JobContext = NO_RETRY): Promise<void> {
  const { jobId, offerId } = JobPayloads["offer.parse"].parse(data);
  let ownerForFailure: string | null = null;
  const fail = async (reason: string) => {
    if (ownerForFailure) await markOfferFailed(deps.core, SYSTEM, { offerId, ownerId: ownerForFailure, error: reason });
  };
  await runCrewJob(
    deps,
    { name: "offer.parse", jobId, ctx, crewRequest: false, onFailed: () => fail("job_failed") },
    async ({ job, ownerId, base }) => {
      if (job.refId !== offerId) return { reply: null, status: "failed", error: PARSE_FAILED_TEXT };
      const [owned] = await deps.core.db
        .select({ id: offers.id })
        .from(offers)
        .where(and(eq(offers.id, offerId), eq(offers.ownerId, ownerId)));
      if (!owned) return { reply: null, status: "failed", error: PARSE_FAILED_TEXT };
      ownerForFailure = ownerId;
      const offer = await getOffer(deps.core, SYSTEM, offerId);
      if (!offer.documentId) {
        await fail("no_document");
        return { reply: null, status: "failed", error: NO_LETTER_TEXT };
      }
      const { meta, bytes } = await readDocumentBytes(deps.core, SYSTEM, offer.documentId);
      if (meta.mime !== "application/pdf" || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        await fail("not_pdf");
        return { reply: null, status: "failed", error: NOT_PDF_TEXT };
      }
      const { parsed, refused } = await runOfferParse(base, {
        ownerId,
        pdfBase64: bytes.toString("base64"),
        collegeName: offer.collegeName,
      });
      if (!parsed) {
        await fail(refused ? "refused" : "no_result");
        return { reply: null, status: "failed", error: PARSE_FAILED_TEXT, safety: refused ? "refusal" : null };
      }
      const saved = await saveParsedOffer(deps.core, SYSTEM, {
        ownerId,
        offerId,
        costOfAttendanceUsd: parsed.costOfAttendanceUsd,
        lines: parsed.lines,
        // R2P-16: pass the letter's year only when it differs; 08 keeps it only within a year of the current award year.
        ...(parsed.awardYear && parsed.awardYear !== offer.awardYear ? { awardYear: parsed.awardYear } : {}),
      });
      return { reply: offerReply(offerId, offer.collegeName, saved.lines.length), status: "ready" };
    },
  );
}
