import type { Keyring } from "../crypto";

import { type DbOrTx, blobs, desc, documents, eq } from "@scholarcrew/db";
import {
  type Actor,
  DocumentKind,
  type DocumentMeta,
  MAX_UPLOAD_BYTES,
  UploadMime,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner, assertUser } from "../access";
import { recordAudit } from "../audit";
import { decrypt, encrypt } from "../crypto";
import { type CoreDeps, one, requireUuid, toIso } from "../shared";

type DocumentRow = typeof documents.$inferSelect;

function toMeta(row: DocumentRow): DocumentMeta {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mime: UploadMime.parse(row.mime),
    sizeBytes: row.sizeBytes,
    parseStatus: row.parseStatus,
    uploadedAt: toIso(row.uploadedAt),
  };
}

function cleanFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const trimmed = base.trim().slice(0, 255);
  return trimmed.length > 0 ? trimmed : "upload";
}

export function sniffMime(bytes: Uint8Array): UploadMime | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes("\0") && !text.trimStart().startsWith("<")) return "text/plain";
  } catch {
    return null;
  }
  return null;
}

async function insertBlob(db: DbOrTx, key: Keyring, bytes: Buffer, now: Date): Promise<string> {
  const sealed = encrypt(key, bytes);
  const row = one(
    await db
      .insert(blobs)
      .values({ ...sealed, createdAt: now })
      .returning({ id: blobs.id }),
    "blobs insert",
  );
  return row.id;
}

/** Encrypts bytes with the app key into one blob row. */
export async function putBlob(deps: CoreDeps, bytes: Buffer): Promise<string> {
  return insertBlob(deps.db, deps.config.keyring, bytes, deps.clock.now());
}

export async function getBlob(deps: CoreDeps, blobId: string): Promise<Buffer> {
  requireUuid(blobId, "File not found");
  const [row] = await deps.db.select().from(blobs).where(eq(blobs.id, blobId));
  if (!row) throw notFound("File not found");
  return decrypt(deps.config.keyring, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyId: row.keyId });
}

/** ON-02: PDF, text, PNG, or JPEG up to 10 MB, encrypted at rest. */
export async function uploadDocument(
  deps: CoreDeps,
  actor: Actor,
  i: { kind: DocumentKind; filename: string; mime: string; bytes: Buffer },
): Promise<DocumentMeta> {
  assertUser(actor);
  const kind = DocumentKind.safeParse(i.kind);
  if (!kind.success) throw invalidInput("Choose a document type");
  const mime = UploadMime.safeParse(i.mime);
  if (!mime.success) throw invalidInput("Upload a PDF, text file, PNG, or JPEG");
  if (i.bytes.length === 0) throw invalidInput("The file is empty");
  if (i.bytes.length > MAX_UPLOAD_BYTES) throw invalidInput("Files can be up to 10 MB");
  const sniffed = sniffMime(i.bytes);
  if (sniffed !== mime.data) throw invalidInput(`That file doesn't look like a ${mime.data}.`);
  const now = deps.clock.now();
  const ownerId = actor.userId;
  const row = await deps.db.transaction(async (tx) => {
    const blobId = await insertBlob(tx, deps.config.keyring, i.bytes, now);
    return one(
      await tx
        .insert(documents)
        .values({
          ownerId,
          kind: kind.data,
          filename: cleanFilename(i.filename),
          mime: sniffed,
          sizeBytes: i.bytes.length,
          blobId,
          uploadedAt: now,
        })
        .returning(),
      "documents insert",
    );
  });
  await recordAudit(deps, {
    actor,
    action: "document_uploaded",
    entityType: "document",
    entityId: row.id,
    meta: { kind: row.kind, sizeBytes: row.sizeBytes },
  });
  return toMeta(row);
}

async function loadDocument(deps: CoreDeps, actor: Actor, id: string): Promise<DocumentRow> {
  requireUuid(id, "Document not found");
  const [row] = await deps.db.select().from(documents).where(eq(documents.id, id));
  if (!row) throw notFound("Document not found");
  assertOwner(actor, row.ownerId);
  return row;
}

export async function getDocument(deps: CoreDeps, actor: Actor, id: string): Promise<DocumentMeta> {
  return toMeta(await loadDocument(deps, actor, id));
}

/** The actor's own uploads, newest first. Documents are never shared with family or helpers. */
export async function listDocuments(deps: CoreDeps, actor: Actor): Promise<DocumentMeta[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(documents)
    .where(eq(documents.ownerId, actor.userId))
    .orderBy(desc(documents.uploadedAt));
  return rows.map(toMeta);
}

/** Owner or system (offer parsing). Parents, helpers, and admins get not_found. */
export async function readDocumentBytes(
  deps: CoreDeps,
  actor: Actor,
  id: string,
): Promise<{ meta: DocumentMeta; bytes: Buffer }> {
  const row = await loadDocument(deps, actor, id);
  return { meta: toMeta(row), bytes: await getBlob(deps, row.blobId) };
}

export async function deleteDocument(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const row = await loadDocument(deps, actor, id);
  await deps.db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.id, row.id));
    const others = await tx.select({ id: documents.id }).from(documents).where(eq(documents.blobId, row.blobId));
    if (others.length === 0) await tx.delete(blobs).where(eq(blobs.id, row.blobId));
  });
  await recordAudit(deps, { actor, action: "document_deleted", entityType: "document", entityId: row.id });
}
