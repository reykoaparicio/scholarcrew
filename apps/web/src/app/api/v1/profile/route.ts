import { body, route } from "@/server/http";
import { assertUser } from "@scholarcrew/core/access";
import { getProfile, updateProfile } from "@scholarcrew/core/profile";
import { ProfilePatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => {
  assertUser(actor);
  return getProfile(deps, actor, actor.userId);
});

export const PATCH = route({ auth: "user" }, async ({ req, deps, actor }) =>
  updateProfile(deps, actor, await body(req, ProfilePatch)),
);
