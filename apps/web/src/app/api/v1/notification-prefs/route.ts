import { body, route } from "@/server/http";
import { getPrefs, updatePrefs } from "@scholarcrew/core/notifications";
import { NotificationPrefsPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => getPrefs(deps, actor));

export const PATCH = route({ auth: "user" }, async ({ req, deps, actor }) =>
  updatePrefs(deps, actor, await body(req, NotificationPrefsPatch)),
);
