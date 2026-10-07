import { body, route, studentIdParam } from "@/server/http";
import { getShareSettings, updateShareSettings } from "@scholarcrew/core/family";
import { ShareSettingsInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getShareSettings(deps, actor, studentIdParam({ actor, url })),
);

export const PUT = route({ auth: "user" }, async ({ req, deps, actor }) =>
  updateShareSettings(deps, actor, await body(req, ShareSettingsInput)),
);
