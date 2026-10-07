import { CollegeImportRow } from "@scholarcrew/domain";

export type ScorecardError = { line: number; message: string };

/** RFC 4180: quoted fields, "" escapes, commas and newlines inside quotes, CRLF or LF, optional trailing newline. */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < input.length) {
    const c = input.charAt(i);
    if (quoted) {
      if (c === '"' && input.charAt(i + 1) === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        quoted = false;
        i += 1;
      } else {
        field += c;
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      i += 1;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (c === "\r" || c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += c === "\r" && input.charAt(i + 1) === "\n" ? 2 : 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const REQUIRED_COLUMNS = ["UNITID", "INSTNM", "STABBR", "CONTROL"] as const;
const NULL_VALUES = new Set(["", "NULL", "PrivacySuppressed"]);
const CONTROL_CODES: Record<string, CollegeImportRow["control"]> = {
  "1": "public",
  "2": "private_nonprofit",
  "3": "private_forprofit",
};

function numberOrNull(raw: string | null): number | null {
  return raw === null ? null : Number(raw);
}

/** Whole dollars. Scorecard net prices can dip below zero; those count as $0. NaN passes through so validation reports it. */
function dollars(raw: string | null): number | null {
  const value = numberOrNull(raw);
  if (value === null || !Number.isFinite(value)) return value;
  return Math.max(0, Math.round(value));
}

/**
 * Rows plus per-line errors. Line 1 is the header, so the first data row is line 2. `lines[k]` is the CSV line
 * of `rows[k]`, so callers can map errors about a row (14 N12 `importColleges` results) back to the file (R2C-13).
 */
export function parseScorecardCsvWithErrors(text: string): {
  rows: CollegeImportRow[];
  lines: number[];
  errors: ScorecardError[];
} {
  const [header, ...records] = parseCsv(text);
  if (!header) return { rows: [], lines: [], errors: [{ line: 1, message: "The file is empty." }] };
  const columns = new Map(header.map((name, at) => [name.trim().toUpperCase(), at] as const));
  const missing = REQUIRED_COLUMNS.filter((name) => !columns.has(name));
  if (missing.length > 0) {
    return { rows: [], lines: [], errors: missing.map((name) => ({ line: 1, message: `Missing column ${name}` })) };
  }
  const rows: CollegeImportRow[] = [];
  const lines: number[] = [];
  const errors: ScorecardError[] = [];
  for (const [n, record] of records.entries()) {
    if (record.every((value) => value.trim() === "")) continue;
    const cell = (name: string): string | null => {
      const at = columns.get(name);
      const raw = at === undefined ? "" : (record[at] ?? "").trim();
      return NULL_VALUES.has(raw) ? null : raw;
    };
    const control = CONTROL_CODES[cell("CONTROL") ?? ""];
    const suffix = control === "public" ? "PUB" : "PRIV";
    const price = (stem: string) => dollars(cell(`${stem}_${suffix}`));
    const parsed = CollegeImportRow.safeParse({
      id: cell("UNITID") ?? "",
      name: cell("INSTNM") ?? "",
      state: (cell("STABBR") ?? "").toUpperCase(),
      city: cell("CITY") ?? "",
      control: control ?? cell("CONTROL") ?? "",
      admitRate: numberOrNull(cell("ADM_RATE")),
      costOfAttendanceUsd: dollars(cell("COSTT4_A")) === 0 ? null : dollars(cell("COSTT4_A")),
      netPriceByIncome: {
        overall: price("NPT4"),
        under_30k: price("NPT41"),
        "30_48k": price("NPT42"),
        "48_75k": price("NPT43"),
        "75_110k": price("NPT44"),
        over_110k: price("NPT45"),
      },
    });
    if (parsed.success) {
      rows.push(parsed.data);
      lines.push(n + 2);
    } else {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.map(String).join(".") || "row"}: ${issue.message}`)
        .join("; ");
      errors.push({ line: n + 2, message });
    }
  }
  return { rows, lines, errors };
}

/** §9.6 surface: the valid rows only. Use parseScorecardCsvWithErrors to show admins what was skipped. */
export function parseScorecardCsv(text: string): CollegeImportRow[] {
  return parseScorecardCsvWithErrors(text).rows;
}
