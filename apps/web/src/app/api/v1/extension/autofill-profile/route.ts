import { extensionPreflight, requireScope, route } from "@/server/http";
import { getAutofillProfile } from "@scholarcrew/core/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// EX-01: the extension proposes these values; it never submits a form.
export const GET = route({ auth: "bearer", cors: "extension" }, async (ctx) => {
  requireScope(ctx, "autofill");
  return getAutofillProfile(ctx.deps, ctx.actor);
});

export const OPTIONS = extensionPreflight;
