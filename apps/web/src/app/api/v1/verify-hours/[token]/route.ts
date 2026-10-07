import { PUBLIC_BODY_LIMIT, body, route } from "@/server/http";
import { getVerificationRequest, submitVerification } from "@scholarcrew/core/impact";
import { VerificationSubmitInput, notFound } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One bucket per IP for both methods, so a token can't be guessed by alternating GET and POST.
const RATE = { key: "verify-hours", limit: 10, windowSeconds: 3600 };

export const GET = route<{ token: string }>({ auth: "none", rate: RATE }, async ({ deps, params }) => {
  const view = await getVerificationRequest(deps, params.token);
  if (!view) throw notFound("This link has expired or was already used.");
  return view;
});

// Public body: the small cap (413 past 64 KB).
export const POST = route<{ token: string }>({ auth: "none", rate: RATE }, async ({ deps, req, params }) => {
  await submitVerification(deps, params.token, await body(req, VerificationSubmitInput, PUBLIC_BODY_LIMIT));
});
