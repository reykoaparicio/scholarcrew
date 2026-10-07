import { body, route } from "@/server/http";
import { setScholarshipStatus } from "@scholarcrew/core/admin";
import { ScholarshipStatusInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publishing sets the verified date and verifier (AD-02); retire and flag hide the listing everywhere.
export const POST = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) => {
  const { status, note } = await body(req, ScholarshipStatusInput);
  return setScholarshipStatus(deps, actor, params.id, status, note);
});
