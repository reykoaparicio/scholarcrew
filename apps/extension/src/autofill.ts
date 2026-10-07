import type { AutofillProfile } from "@scholarcrew/domain";
import { detectFields } from "./fields";
import { buildProposals } from "./fill";
import { ContentRequest, type ContentResponse, UNKNOWN_REQUEST } from "./messages";
import { type PanelHandle, showReviewPanel } from "./panel";

export function startAutofill(doc: Document, profile: AutofillProfile): { proposals: number; panel: PanelHandle } {
  const proposals = buildProposals(detectFields(doc), profile);
  const panel = showReviewPanel(doc, proposals);
  return { proposals: proposals.length, panel };
}

export function handleContentMessage(doc: Document, message: unknown): ContentResponse {
  const parsed = ContentRequest.safeParse(message);
  if (!parsed.success) return { ok: false, error: UNKNOWN_REQUEST };
  return { ok: true, proposals: startAutofill(doc, parsed.data.profile).proposals };
}
