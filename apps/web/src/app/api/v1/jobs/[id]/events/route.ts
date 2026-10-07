import { route } from "@/server/http";
import { getJob } from "@scholarcrew/core/crew";
import { SSE_HEADERS, jobEventStream } from "./stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The first getJob runs before the stream opens, so unknown and not-yours jobs are a plain 404 JSON error.
export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params, req }) => {
  const job = await getJob(deps, actor, params.id);
  return new Response(jobEventStream(deps, actor, job, req.signal), { status: 200, headers: SSE_HEADERS });
});
