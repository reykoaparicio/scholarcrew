import { fileResponse, query, route } from "@/server/http";
import { getExport } from "@scholarcrew/core/account";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Non-strict: only `format` is read. A missing format is the JSON file; anything but json or md is 400.
const ExportQuery = z.object({ format: z.enum(["json", "md"]).default("json") });

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params, url }) => {
  const { format } = query(url, ExportQuery);
  const { record, bytes } = await getExport(deps, actor, params.id);
  if (!bytes) return record;
  const name = `scholarcrew-export-${record.createdAt.slice(0, 10)}`;
  if (format === "md") {
    const { markdown } = JSON.parse(bytes.toString("utf8")) as { markdown: string };
    return fileResponse(Buffer.from(markdown, "utf8"), "text/markdown; charset=utf-8", `${name}.md`);
  }
  return fileResponse(bytes, "application/json; charset=utf-8", `${name}.json`);
});
