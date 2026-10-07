import {
  MODEL_ID,
  type ModelTurn,
  STRICT_UNION_LIMIT,
  buildExtractParams,
  countStrictUnions,
  wrapUntrusted,
} from "@scholarcrew/agents";
import { closeTestDb } from "@scholarcrew/db/testing";
import { ListingDraft } from "@scholarcrew/domain";
import { afterAll, describe, expect, it, vi } from "vitest";
import { testDeps } from "../test/deps";
import { PAGE_TEXT, SOURCE_URL, VALID_DRAFT } from "../test/fixtures";
import { EXTRACT_SYSTEM, extractListing } from "./extract";
import { createFakeExtractModel } from "./testing";

afterAll(() => closeTestDb());

describe("extractListing", () => {
  it("sends the page as untrusted data with the source URL and returns the draft", async () => {
    const model = createFakeExtractModel([{ raw: JSON.stringify(VALID_DRAFT) }]);
    const draft = await extractListing(testDeps({ model }), { url: SOURCE_URL, pageText: PAGE_TEXT });
    expect(draft).toEqual(VALID_DRAFT);
    expect(model.extractCalls).toHaveLength(1);
    const call = model.extractCalls[0];
    expect(call).toMatchObject({ role: "catalog", system: EXTRACT_SYSTEM, effort: "low", maxTokens: 8000 });
    expect(call?.content).toEqual([
      wrapUntrusted("scholarship_page", PAGE_TEXT),
      { type: "text", text: `Source URL: ${SOURCE_URL}` },
    ]);
  });

  it("caps the page text at 50,000 characters", async () => {
    const model = createFakeExtractModel([{ raw: VALID_DRAFT }]);
    await extractListing(testDeps({ model }), { url: SOURCE_URL, pageText: "a".repeat(60_000) });
    expect(model.extractCalls[0]?.content[0]).toEqual(wrapUntrusted("scholarship_page", "a".repeat(50_000)));
  });

  it("returns null when the model refuses", async () => {
    const model = createFakeExtractModel([{ refused: true }]);
    expect(await extractListing(testDeps({ model }), { url: SOURCE_URL, pageText: PAGE_TEXT })).toBeNull();
  });

  it("returns null for invalid JSON or a draft that fails the schema", async () => {
    const model = createFakeExtractModel([{ raw: "{not json" }, { raw: { ...VALID_DRAFT, name: "" } }]);
    const deps = testDeps({ model });
    expect(await extractListing(deps, { url: SOURCE_URL, pageText: PAGE_TEXT })).toBeNull();
    expect(await extractListing(deps, { url: SOURCE_URL, pageText: PAGE_TEXT })).toBeNull();
  });

  it("falls back to the source URL when the draft has no usable URL", async () => {
    const model = createFakeExtractModel([
      { raw: { ...VALID_DRAFT, url: "" } },
      { raw: { ...VALID_DRAFT, url: "mailto:awards@example.org" } },
    ]);
    const deps = testDeps({ model });
    const pageUrl = "https://cf.example.org/awards/rotary";
    expect((await extractListing(deps, { url: pageUrl, pageText: PAGE_TEXT }))?.url).toBe(pageUrl);
    expect((await extractListing(deps, { url: pageUrl, pageText: PAGE_TEXT }))?.url).toBe(pageUrl);
  });

  it("reports usage for every call, and a failed usage write doesn't lose the draft", async () => {
    const turns: ModelTurn[] = [];
    const deps = testDeps({
      model: createFakeExtractModel([{ raw: VALID_DRAFT }, { refused: true }]),
      onUsage: async (_role, t) => {
        turns.push(t);
      },
    });
    await extractListing(deps, { url: SOURCE_URL, pageText: PAGE_TEXT });
    await extractListing(deps, { url: SOURCE_URL, pageText: PAGE_TEXT });
    expect(turns.map((t) => [t.stopReason, t.model, t.durationMs])).toEqual([
      ["end_turn", MODEL_ID, 0],
      ["refusal", MODEL_ID, 0],
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const failing = testDeps({
      model: createFakeExtractModel([{ raw: VALID_DRAFT }]),
      onUsage: () => Promise.reject(new Error("insert failed")),
    });
    expect(await extractListing(failing, { url: SOURCE_URL, pageText: PAGE_TEXT })).toEqual(VALID_DRAFT);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("catalog usage write failed"));
    log.mockRestore();
  });

  it("keeps the ListingDraft output schema within the strict union limit (R3E-3)", () => {
    // The same schema goes out on every K7 re-check batch item, one per request, so this covers both.
    const params = buildExtractParams({
      role: "catalog",
      system: EXTRACT_SYSTEM,
      content: [{ type: "text", text: `Source URL: ${SOURCE_URL}` }],
      schema: ListingDraft,
      effort: "low",
      maxTokens: 8000,
    });
    expect(countStrictUnions(params)).toBeGreaterThan(0);
    expect(countStrictUnions(params)).toBeLessThanOrEqual(STRICT_UNION_LIMIT);
  });
});
