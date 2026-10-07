import { PayloadTooLargeError, json, readBytesCapped, route } from "@/server/http";
import { listDocuments, uploadDocument } from "@scholarcrew/core/documents";
import { DocumentKind, MAX_UPLOAD_BYTES, invalidInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Room for the multipart boundary and part headers on top of the file itself.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const TOO_BIG = "Files can be up to 10 MB";

/** D27: the caller's own uploads, newest first (Settings and the offer upload picker). */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => listDocuments(deps, actor));

export const POST = route(
  { auth: "user", rate: { key: "documents.upload", limit: 20, windowSeconds: 3600 } },
  async ({ req, deps, actor }) => {
    const raw = await readBytesCapped(req, MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES, TOO_BIG);
    let form: FormData;
    try {
      const contentType = req.headers.get("content-type") ?? "";
      form = await new Response(raw, { headers: { "content-type": contentType } }).formData();
    } catch {
      throw invalidInput("Send the file as multipart form data");
    }
    const kind = DocumentKind.safeParse(form.get("kind"));
    if (!kind.success) throw invalidInput("Choose a document type");
    const file = form.get("file");
    if (!(file instanceof File)) throw invalidInput("Attach a file");
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeError(TOO_BIG);
    const mime = (file.type.split(";")[0] ?? "").trim().toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    return json(await uploadDocument(deps, actor, { kind: kind.data, filename: file.name, mime, bytes }), 201);
  },
);
