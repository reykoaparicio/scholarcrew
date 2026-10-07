import { route } from "@/server/http";
import { deleteDocument, getDocument } from "@scholarcrew/core/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getDocument(deps, actor, params.id),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteDocument(deps, actor, params.id);
});
