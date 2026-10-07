import { clearSessionCookie } from "@/server/cookies";
import { route } from "@/server/http";
import { deleteAccount } from "@scholarcrew/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Blocks the account and deletes its sessions now; the purge job hard-deletes rows within 7 days. */
export const DELETE = route({ auth: "user" }, async ({ deps, actor }) => {
  await deleteAccount(deps, actor);
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" },
  });
});
