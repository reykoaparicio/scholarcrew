import { describe, expect, it } from "vitest";
import { parseCsv, parseScorecardCsv, parseScorecardCsvWithErrors } from "./csv";

const HEADER =
  "UNITID,INSTNM,CITY,STABBR,CONTROL,ADM_RATE,COSTT4_A,NPT4_PUB,NPT4_PRIV,NPT41_PUB,NPT42_PUB,NPT43_PUB,NPT44_PUB,NPT45_PUB,NPT41_PRIV,NPT42_PRIV,NPT43_PRIV,NPT44_PRIV,NPT45_PRIV";

const SAMPLE = [
  HEADER,
  "100001,Maple State University,Maple City,TX,1,0.6812,24510.4,12001.6,NULL,8000,9100,12500,17000,21000,NULL,NULL,NULL,NULL,NULL",
  '100002,"Eastside College, Main Campus",Eastside,tx,2,0.1234,61200,NULL,24500,NULL,NULL,NULL,NULL,NULL,4800,6100,11000,19000,32000.5',
  "100003,Lone Star Tech Institute,Austin,TX,3,NULL,PrivacySuppressed,NULL,18750,NULL,NULL,NULL,NULL,NULL,PrivacySuppressed,PrivacySuppressed,18000,,NULL",
  "",
].join("\r\n");

const ALL_NULL = { overall: null, under_30k: null, "30_48k": null, "48_75k": null, "75_110k": null, over_110k: null };

describe("parseCsv", () => {
  it("splits simple rows and ignores the trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields, escaped quotes, newlines inside quotes, and CRLF", () => {
    expect(parseCsv('name,notes\r\n"Smith, Jo","He said ""hi""\nthen left"\r\nx,y')).toEqual([
      ["name", "notes"],
      ["Smith, Jo", 'He said "hi"\nthen left'],
      ["x", "y"],
    ]);
  });

  it("keeps empty fields and strips a byte order mark", () => {
    expect(parseCsv("\uFEFFa,,c\n,\n")).toEqual([
      ["a", "", "c"],
      ["", ""],
    ]);
  });
});

describe("parseScorecardCsv", () => {
  it("maps a 3-row extract with NULL and PrivacySuppressed cells", () => {
    const { rows, lines, errors } = parseScorecardCsvWithErrors(SAMPLE);
    expect(errors).toEqual([]);
    expect(lines).toEqual([2, 3, 4]);
    expect(rows).toEqual([
      {
        id: "100001",
        name: "Maple State University",
        state: "TX",
        city: "Maple City",
        control: "public",
        admitRate: 0.6812,
        costOfAttendanceUsd: 24510,
        netPriceByIncome: {
          overall: 12002,
          under_30k: 8000,
          "30_48k": 9100,
          "48_75k": 12500,
          "75_110k": 17000,
          over_110k: 21000,
        },
      },
      {
        id: "100002",
        name: "Eastside College, Main Campus",
        state: "TX",
        city: "Eastside",
        control: "private_nonprofit",
        admitRate: 0.1234,
        costOfAttendanceUsd: 61200,
        netPriceByIncome: {
          overall: 24500,
          under_30k: 4800,
          "30_48k": 6100,
          "48_75k": 11000,
          "75_110k": 19000,
          over_110k: 32001,
        },
      },
      {
        id: "100003",
        name: "Lone Star Tech Institute",
        state: "TX",
        city: "Austin",
        control: "private_forprofit",
        admitRate: null,
        costOfAttendanceUsd: null,
        netPriceByIncome: { ...ALL_NULL, overall: 18750, "48_75k": 18000 },
      },
    ]);
    expect(parseScorecardCsv(SAMPLE)).toEqual(rows);
  });

  it("reports invalid rows with line numbers, skips blank lines, and gives each kept row its CSV line", () => {
    const text = [
      "UNITID,INSTNM,CITY,STABBR,CONTROL,ADM_RATE",
      "12345,Short Id College,Austin,TX,1,0.5",
      "100010,Bad Control College,Austin,TX,9,0.5",
      "",
      "100011,,Austin,TX,1,0.5",
      "100012,Rate College,Austin,TX,2,abc",
      "100013,Good College,Austin,TX,2,0.25",
    ].join("\n");
    const { rows, lines, errors } = parseScorecardCsvWithErrors(text);
    expect(rows).toEqual([
      {
        id: "100013",
        name: "Good College",
        state: "TX",
        city: "Austin",
        control: "private_nonprofit",
        admitRate: 0.25,
        costOfAttendanceUsd: null,
        netPriceByIncome: ALL_NULL,
      },
    ]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 5, 6]);
    // R2C-13: lines[k] is the CSV line of rows[k]; blank line 4 and invalid lines 2, 3, 5, 6 are skipped.
    expect(lines).toEqual([7]);
    expect(errors[0]?.message).toMatch(/^id: /);
    expect(errors[1]?.message).toMatch(/^control: /);
    expect(errors[2]?.message).toMatch(/^name: /);
    expect(errors[3]?.message).toMatch(/^admitRate: /);
    expect(parseScorecardCsv(text)).toEqual(rows);
  });

  it("reports missing required columns and empty files on line 1", () => {
    expect(parseScorecardCsvWithErrors("UNITID,INSTNM,CITY\n100001,X,Y")).toEqual({
      rows: [],
      lines: [],
      errors: [
        { line: 1, message: "Missing column STABBR" },
        { line: 1, message: "Missing column CONTROL" },
      ],
    });
    expect(parseScorecardCsvWithErrors("")).toEqual({
      rows: [],
      lines: [],
      errors: [{ line: 1, message: "The file is empty." }],
    });
  });
});
