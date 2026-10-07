import { route } from "@/server/http";
import { deleteAidDeadline } from "@scholarcrew/core/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Audited as aid_deadline_deleted; a second delete is 404.
export const DELETE = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, params }) => {
  await deleteAidDeadline(deps, actor, params.id);
});
