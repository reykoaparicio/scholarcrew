import { importColleges } from "@scholarcrew/core/admin";
import { colleges, eq } from "@scholarcrew/db";
import type { ImportResult } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  chunkedRequest,
  errorOf,
  readJson,
  request,
  signedInAdmin,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { POST as importCsv } from "./route";

// A pass-through spy: every test runs the real importColleges, except where one queues a single result.
// Valid parsed rows never fail CollegeImportRow again, so an import-side error can't be produced from a CSV alone.
// (Vitest 3's restoreAllMocks in 13's setup touches only vi.spyOn spies, so the pass-through survives.)
vi.mock("@scholarcrew/core/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scholarcrew/core/admin")>();
  return { ...actual, importColleges: vi.fn(actual.importColleges) };
});

const deps = useTestDeps();

const HEADER = "UNITID,INSTNM,CITY,STABBR,CONTROL,ADM_RATE,COSTT4_A,NPT4_PUB,NPT4_PRIV";
const CSV = [
  HEADER,
  "100001,Maple State University,Maple City,TX,1,0.6812,24510,12001,NULL",
  "100010,Bad Control College,Austin,TX,9,0.5,30000,NULL,20000",
  "",
].join("\n");

function upload(cookie: string | undefined, text: string, contentType = "text/csv"): Promise<Response> {
  const headers = { "content-type": contentType };
  return importCsv(request("/admin/colleges/import", { method: "POST", cookie, body: text, headers }), NO_PARAMS);
}

describe("POST /admin/colleges/import (AD-03)", () => {
  it("imports the good rows and reports the bad row with its CSV line", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const res = await upload(cookie, CSV);
    expect(res.status).toBe(200);
    const result = await readJson<ImportResult>(res);
    expect(result).toEqual({
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{ line: 3, message: expect.stringMatching(/^control: /) }],
    });
    const [row] = await deps().db.select().from(colleges).where(eq(colleges.id, "100001"));
    expect(row).toMatchObject({
      name: "Maple State University",
      state: "TX",
      control: "public",
      costOfAttendanceUsd: 24510,
    });

    const again = await readJson<ImportResult>(await upload(cookie, CSV));
    expect(again).toMatchObject({ inserted: 0, updated: 1, skipped: 1 });
  });

  it("returns header errors without importing anything", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const result = await readJson<ImportResult>(await upload(cookie, "UNITID,INSTNM\n100001,Maple State University"));
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [
        { line: 1, message: "Missing column STABBR" },
        { line: 1, message: "Missing column CONTROL" },
      ],
    });
    expect(await deps().db.select().from(colleges)).toEqual([]);
  });

  it("rejects bodies that aren't CSV, and answers 413 past 5 MB with or without Content-Length", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const json = await upload(cookie, CSV, "application/json");
    expect(json.status).toBe(400);
    expect((await errorOf(json)).message).toBe("Send the College Scorecard extract as text/csv.");
    const big = await upload(cookie, `${HEADER}\n${"x".repeat(5 * 1024 * 1024)}`);
    expect(big.status).toBe(413);
    expect((await errorOf(big)).message).toBe("The CSV is over 5 MB. Split it and import each part.");
    const { req, pulled } = chunkedRequest("/admin/colleges/import", {
      cookie,
      chunk: new TextEncoder().encode(`${"x".repeat(1023)}\n`.repeat(1024)),
      count: 10,
      headers: { "content-type": "text/csv" },
    });
    expect((await importCsv(req, NO_PARAMS)).status).toBe(413);
    expect(pulled()).toBeLessThan(10);
    expect(await deps().db.select().from(colleges)).toEqual([]);
  });

  it("maps import-side errors back to their CSV lines (R2C-13)", async () => {
    const { cookie } = await signedInAdmin(deps().db);
    const csv = [
      HEADER,
      "100001,Maple State University,Maple City,TX,1,0.6812,24510,12001,NULL",
      "100010,Bad Control College,Austin,TX,9,0.5,30000,NULL,20000",
      "100002,Cedar College,Waco,TX,2,0.4,40000,NULL,25000",
      "100003,Pine University,Tyler,TX,1,0.7,22000,11000,NULL",
    ].join("\n");
    // importColleges sees three rows (CSV lines 2, 4, 5) and reports its third row, which is CSV line 5.
    vi.mocked(importColleges).mockResolvedValueOnce({
      inserted: 2,
      updated: 0,
      skipped: 1,
      errors: [{ line: 3, message: "Duplicate UNITID" }],
    });
    const result = await readJson<ImportResult>(await upload(cookie, csv));
    expect(vi.mocked(importColleges).mock.lastCall?.[2].map((r) => r.id)).toEqual(["100001", "100002", "100003"]);
    expect(result).toEqual({
      inserted: 2,
      updated: 0,
      skipped: 2,
      errors: [
        { line: 3, message: expect.stringMatching(/^control: /) },
        { line: 5, message: "Duplicate UNITID" },
      ],
    });
  });

  it("is admin only", async () => {
    expect((await upload(undefined, CSV)).status).toBe(401);
    const { cookie } = await signedInStudent(deps().db);
    expect((await upload(cookie, CSV)).status).toBe(404);
  });
});
