import { fileResponse, route } from "@/server/http";
import { readDocumentBytes } from "@scholarcrew/core/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  const { meta, bytes } = await readDocumentBytes(deps, actor, params.id);
  return fileResponse(bytes, meta.mime, meta.filename);
});
