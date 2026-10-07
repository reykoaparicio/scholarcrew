import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const DocumentKind = z.enum(["award_letter", "transcript", "score_report", "essay", "resume", "other"]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const ParseStatus = z.enum(["none", "queued", "parsing", "parsed", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatus>;

export const ALLOWED_UPLOAD_MIMES = ["application/pdf", "text/plain", "image/png", "image/jpeg"] as const;
export const UploadMime = z.enum(ALLOWED_UPLOAD_MIMES);
export type UploadMime = z.infer<typeof UploadMime>;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DocumentMeta = z.strictObject({
  id: Id,
  kind: DocumentKind,
  filename: z.string().min(1).max(255),
  mime: UploadMime,
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  parseStatus: ParseStatus,
  uploadedAt: IsoDateTime,
});
export type DocumentMeta = z.infer<typeof DocumentMeta>;

export const ExportStatus = z.enum(["queued", "ready", "failed"]);
export type ExportStatus = z.infer<typeof ExportStatus>;

export const ExportRecord = z.strictObject({
  id: Id,
  status: ExportStatus,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
  downloadUrl: z.string().nullable(),
});
export type ExportRecord = z.infer<typeof ExportRecord>;
