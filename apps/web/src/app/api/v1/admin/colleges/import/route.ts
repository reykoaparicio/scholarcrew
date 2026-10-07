import { readTextCapped, route } from "@/server/http";
import { parseScorecardCsvWithErrors } from "@scholarcrew/catalog/csv";
import { importColleges } from "@scholarcrew/core/admin";
import { type ImportResult, invalidInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const CSV_TYPES = new Set(["text/csv", "text/plain"]);
const TOO_BIG = "The CSV is over 5 MB. Split it and import each part.";

export const POST = route({ auth: "admin" }, async ({ deps, actor, req }): Promise<ImportResult> => {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!CSV_TYPES.has(type)) throw invalidInput("Send the College Scorecard extract as text/csv.");
  // 413 from a declared Content-Length before reading, or as soon as a chunked body passes 5 MB (D-14-5).
  const text = await readTextCapped(req, MAX_CSV_BYTES, TOO_BIG);

  const parsed = parseScorecardCsvWithErrors(text);
  const badRows = parsed.errors.filter((e) => e.line > 1).length;
  if (parsed.rows.length === 0) {
    return { inserted: 0, updated: 0, skipped: badRows, errors: parsed.errors };
  }
  const result = await importColleges(deps, actor, parsed.rows);
  // importColleges numbers rows 1..n over parsed.rows; parsed.lines[k] is the CSV line of rows[k] (R2C-13).
  const importErrors = result.errors.map((e) => ({ ...e, line: parsed.lines[e.line - 1] ?? e.line }));
  return {
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped + badRows,
    errors: [...parsed.errors, ...importErrors],
  };
});
