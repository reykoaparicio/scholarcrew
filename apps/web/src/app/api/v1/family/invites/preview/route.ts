import { query, route } from "@/server/http";
import { previewInvite } from "@scholarcrew/core/family";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.strictObject({ token: z.string().min(1).max(200) });

/** { inviterFirstName, memberRole, expiresAt }; unknown, expired, or used tokens are 404. Never the invitee's email. */
export const GET = route(
  { auth: "none", rate: { key: "family.invite-preview", limit: 30, windowSeconds: 3600 } },
  async ({ deps, url }) => previewInvite(deps, query(url, Query).token),
);
