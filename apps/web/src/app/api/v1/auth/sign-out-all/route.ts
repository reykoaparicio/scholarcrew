import { clearSessionCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { signOutEverywhere } from "@scholarcrew/core/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => {
  await signOutEverywhere(deps, actor);
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" },
  });
});
