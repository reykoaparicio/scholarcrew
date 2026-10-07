import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as csv from "./csv";
import * as catalog from "./index";

const readLocal = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("@scholarcrew/catalog", () => {
  it("exports the section 9.6 functions plus extractForTask and parseScorecardCsvWithErrors", () => {
    expect(Object.keys(catalog).sort()).toEqual([
      "BatchNotFoundError",
      "collectRecheck",
      "createAnthropicBatchGateway",
      "createAnthropicResearcher",
      "createFetchPage",
      "extractForTask",
      "extractListing",
      "htmlToText",
      "parseCsv",
      "parseScorecardCsv",
      "parseScorecardCsvWithErrors",
      "researchCandidates",
      "startRecheck",
      "verifyDraft",
    ]);
  });

  it("exposes the CSV parser at ./csv with no Anthropic SDK in its module graph (D-14-4)", () => {
    const manifest = JSON.parse(readLocal("../package.json")) as { exports: Record<string, string> };
    expect(manifest.exports["./csv"]).toBe("./src/csv.ts");
    expect(Object.keys(csv).sort()).toEqual(["parseCsv", "parseScorecardCsv", "parseScorecardCsvWithErrors"]);
    // csv.ts imports only the domain package, and domain depends on zod alone.
    const specifiers = [...readLocal("./csv.ts").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(specifiers).toEqual(["@scholarcrew/domain"]);
    const domain = JSON.parse(readLocal("../../domain/package.json")) as { dependencies?: Record<string, string> };
    const domainDeps = Object.keys(domain.dependencies ?? {});
    expect(domainDeps).not.toContain("@anthropic-ai/sdk");
    expect(domainDeps.filter((name) => name.startsWith("@scholarcrew/"))).toEqual([]);
  });
});
