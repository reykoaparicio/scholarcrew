import { body, route } from "@/server/http";
import { listSensitiveFacts, setSensitiveFact } from "@scholarcrew/core/memory";
import { SensitiveFactInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listSensitiveFacts(deps, actor));

export const PUT = route({ auth: "user" }, async ({ req, deps, actor }) =>
  setSensitiveFact(deps, actor, await body(req, SensitiveFactInput)),
);
