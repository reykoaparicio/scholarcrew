import { devRoutesEnabled } from "@/server/deps";
import { query, route } from "@/server/http";
import { desc, devOutbox, eq } from "@scholarcrew/db";
import { notFound } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.strictObject({ to: z.string().trim().min(3).max(254) });

export const GET = route({ auth: "none" }, async ({ deps, url }) => {
  if (!devRoutesEnabled()) throw notFound();
  const { to } = query(url, Query);
  const [row] = await deps.db
    .select({ subject: devOutbox.subject, text: devOutbox.text })
    .from(devOutbox)
    .where(eq(devOutbox.to, to.toLowerCase()))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  if (!row) throw notFound("No email for that address");
  return row;
});
