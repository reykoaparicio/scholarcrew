import { HelperSheet, HelperUnavailable } from "@/components/public/HelperSheet";
import { HELPER_VIEW_RATE, allowPageRequest } from "@/components/public/pageRate";
import { getDeps } from "@/server/deps";
import { resolveHelperToken } from "@scholarcrew/core/helpers";
import { getHelperView } from "@scholarcrew/core/helperview";
import { type HelperView, isAppError } from "@scholarcrew/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared by a student · ScholarCrew",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** No account: the token is the credential. Unknown, expired, and revoked links all render the 404 page. */
export default async function HelperPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await allowPageRequest(HELPER_VIEW_RATE))) {
    return (
      <HelperUnavailable title="Too many visits in the last hour">
        Wait an hour, then open the link again.
      </HelperUnavailable>
    );
  }
  const deps = getDeps();
  const helper = await resolveHelperToken(deps, token);
  if (!helper) notFound();
  let view: HelperView;
  try {
    view = await getHelperView(deps, helper);
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  }
  return <HelperSheet view={view} nowIso={deps.clock.now().toISOString()} />;
}
