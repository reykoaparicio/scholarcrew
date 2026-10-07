import { AutofillProfile } from "@scholarcrew/domain";
import { z } from "zod";

export const TITLE_LIMIT = 200;
export const SELECTION_LIMIT = 2000;

/** Popup → background. save-page carries no URL: the background always re-reads it from the tab. */
export const PopupRequest = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("status") }),
  z.strictObject({ type: z.literal("autofill") }),
  z.strictObject({ type: z.literal("save-preview") }),
  z.strictObject({ type: z.literal("save-page"), title: z.string().max(TITLE_LIMIT), includeSelection: z.boolean() }),
]);
export type PopupRequest = z.infer<typeof PopupRequest>;
export type PopupRequestType = PopupRequest["type"];

export interface Failure {
  ok: false;
  error: string;
}
export type StatusResponse = { ok: true; displayName: string; email: string } | Failure;
export type AutofillResponse = { ok: true; proposals: number } | Failure;
export type SavePreviewResponse = { ok: true; url: string; title: string; selectedText: string } | Failure;
export type SavePageResponse = { ok: true; name: string; message: string } | Failure;

export interface ResponseMap {
  status: StatusResponse;
  autofill: AutofillResponse;
  "save-preview": SavePreviewResponse;
  "save-page": SavePageResponse;
}
export type BackgroundResponse = ResponseMap[PopupRequestType];

/** Background → content script. */
export const ContentRequest = z.strictObject({ type: z.literal("show-review"), profile: AutofillProfile });
export type ContentRequest = z.infer<typeof ContentRequest>;

export const ContentResponse = z.union([
  z.strictObject({ ok: z.literal(true), proposals: z.number().int().min(0) }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
export type ContentResponse = z.infer<typeof ContentResponse>;

export const SAVED_MESSAGE = "Saved. It's on your board as unverified.";
export const NOT_CONNECTED_MESSAGE =
  "Not connected. Create a token in ScholarCrew under Settings → Browser extension, then paste it here.";
export const UNKNOWN_REQUEST = "Unknown request";

export function failure(error: string): Failure {
  return { ok: false, error };
}
