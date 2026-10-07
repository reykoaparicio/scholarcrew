import { AppError, SPECIALIST_ROLES, type SpecialistRole } from "@scholarcrew/domain";
import { computeGap, retakeAnalysis } from "@scholarcrew/engines";
import { describe, expect, it, vi } from "vitest";
import { toStrictJsonSchema } from "../model/schema";
import type { ToolDef } from "../model/types";
import { JORDAN, createFakePort, createScriptedModelClient, jordanData } from "../testing";
import { calcRegistry, usageReporter } from "./shared";
import { FAMILY_HIDDEN_TOOLS, specialistTools } from "./tools";

function pick(tools: ToolDef[], name: string): ToolDef {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("empty fixture");
  return item;
}

const names = (role: SpecialistRole, audience: "crew" | "family" = "crew") =>
  specialistTools(role, createFakePort(), JORDAN.ownerId, audience).map((t) => t.name);

describe("specialistTools", () => {
  it("withholds income band tables from every college lookup", async () => {
    const tool = pick(specialistTools("aid", createFakePort(), JORDAN.ownerId, "crew"), "get_college");
    const out = await tool.run({ collegeId: JORDAN.collegeId });
    expect(out).not.toHaveProperty("netPriceByIncome");
    expect(out).toHaveProperty("netPriceUsd");
  });

  it("lists bounded summaries and reads one full story separately", async () => {
    const story = first(jordanData().stories);
    const stories = Array.from({ length: 10 }, (_, index) => ({
      ...story,
      id: `${story.id.slice(0, -2)}${String(index).padStart(2, "0")}`,
      moment: "long ".repeat(10000),
      summary: "",
    }));
    const tools = specialistTools("quill", createFakePort({ stories }), JORDAN.ownerId, "crew");
    const summaries = (await pick(tools, "list_stories").run({})) as Array<Record<string, unknown>>;
    expect(summaries).toHaveLength(10);
    expect(JSON.stringify(summaries).length).toBeLessThan(20000);
    expect(summaries[0]).not.toHaveProperty("moment");
    expect(await pick(tools, "get_story").run({ id: stories[0]?.id })).toHaveProperty("moment");
  });

  it("gives each role its own read-only tools", () => {
    expect(names("scout")).toEqual(["get_matches", "search_scholarships", "get_scholarship", "get_deadlines"]);
    expect(names("atlas")).toEqual([
      "get_college_list",
      "get_college",
      "get_application_items",
      "get_deadlines",
      "get_test_scores",
    ]);
    expect(names("quill")).toEqual(["list_stories", "get_story", "get_essay", "count_words"]);
    expect(names("aid")).toEqual(["get_aid_checklist", "get_offers", "get_costs", "get_college"]);
    expect(names("ledger")).toEqual([
      "get_costs",
      "get_offers",
      "ledger_gap",
      "ledger_compare_offers",
      "ledger_loan_payment",
    ]);
    expect(names("prep")).toEqual(["get_test_scores", "get_college_list", "get_college", "retake_value"]);
    expect(names("impact")).toEqual(["get_activities", "get_service_progress", "count_chars"]);
  });

  it("omits essay, story, and test-score tools for the family audience", () => {
    expect(names("quill", "family")).toEqual(["count_words"]);
    expect(names("prep", "family")).toEqual(["get_college_list", "get_college"]);
    expect(names("atlas", "family")).toEqual([
      "get_college_list",
      "get_college",
      "get_application_items",
      "get_deadlines",
    ]);
    for (const role of SPECIALIST_ROLES) {
      for (const hidden of FAMILY_HIDDEN_TOOLS) expect(names(role, "family")).not.toContain(hidden);
    }
    expect(names("scout", "family")).toEqual(names("scout", "crew"));
  });

  it("never offers consult or write tools, and every input schema is strict-ready", () => {
    for (const role of SPECIALIST_ROLES) {
      for (const t of specialistTools(role, createFakePort(), JORDAN.ownerId, "crew")) {
        expect(t.name, t.name).toMatch(/^(get|list|search|count|ledger|retake)_/);
        const schema = toStrictJsonSchema(t.input);
        expect(schema.type).toBe("object");
        expect(schema.additionalProperties).toBe(false);
      }
    }
  });

  it("get_matches passes the audience to the port and strips sensitive reasons", async () => {
    const match = first(jordanData().matches);
    const port = createFakePort({
      matches: [
        {
          ...match,
          reasons: [
            ...match.reasons,
            { code: "first_gen", text: "First in your family to attend college", sensitive: true },
          ],
        },
      ],
    });
    const out = await pick(specialistTools("scout", port, JORDAN.ownerId, "family"), "get_matches").run({});
    expect(port.calls).toEqual(["matches:family"]);
    expect(out).toEqual({ matches: [], privateMatches: 1 });
  });

  it("search_scholarships ignores null filters and get_scholarship reports missing ids", async () => {
    const tools = specialistTools("scout", createFakePort(), JORDAN.ownerId, "crew");
    const found = (await pick(tools, "search_scholarships").run({
      q: "STEM",
      state: null,
      renewable: null,
      minUsd: null,
      deadlineBefore: null,
    })) as Array<{ slug: string }>;
    expect(found.map((s) => s.slug)).toEqual(["hill-country-stem-award"]);
    expect(await pick(tools, "get_scholarship").run({ idOrSlug: "hill-country-stem-award" })).toMatchObject({
      id: JORDAN.scholarshipId,
    });
    const missing = pick(tools, "get_scholarship").run({ idOrSlug: "missing" });
    await expect(missing).rejects.toBeInstanceOf(AppError);
    await expect(missing).rejects.toThrow("No scholarship with that id or slug.");
  });

  it("get_essay returns the draft and list_stories skips archived stories", async () => {
    const data = jordanData();
    const story = first(data.stories);
    const port = createFakePort({
      stories: [
        story,
        {
          ...story,
          id: "77777777-7777-4777-8777-777777777702",
          title: "Old story",
          archivedAt: "2026-09-02T15:00:00.000Z",
        },
      ],
    });
    const tools = specialistTools("quill", port, JORDAN.ownerId, "crew");
    const stories = (await pick(tools, "list_stories").run({})) as Array<{ id: string }>;
    expect(stories.map((s) => s.id)).toEqual([JORDAN.storyId]);
    expect(await pick(tools, "get_essay").run({ essayId: JORDAN.essayId })).toMatchObject({
      body: first(data.essays).body,
      wordCount: 18,
      openComments: 0,
    });
    await expect(pick(tools, "get_essay").run({ essayId: "88888888-8888-4888-8888-888888888899" })).rejects.toThrow(
      "No essay with that id.",
    );
  });

  it("count tools return role-scoped calc ids and count_chars checks the 150-character limit", async () => {
    const quill = specialistTools("quill", createFakePort(), JORDAN.ownerId, "crew");
    expect(await pick(quill, "count_words").run({ text: "Our robot died at regionals." })).toEqual({
      calcId: "calc:quill-1",
      words: 5,
      chars: 28,
    });
    const impact = specialistTools("impact", createFakePort(), JORDAN.ownerId, "crew");
    expect(await pick(impact, "count_chars").run({ text: "x".repeat(151) })).toEqual({
      calcId: "calc:impact-1",
      chars: 151,
      limit: 150,
      over: true,
      remaining: -1,
    });
    expect(await pick(impact, "count_chars").run({ text: "é".repeat(150) })).toMatchObject({
      calcId: "calc:impact-2",
      chars: 150,
      over: false,
    });
  });

  it("Ledger's calculators run the engines", async () => {
    const tools = specialistTools("ledger", createFakePort(), JORDAN.ownerId, "crew");
    const input = { costOfAttendanceUsd: 31_000, freeMoneyUsd: 21_800, pendingUsd: 1000 };
    expect(await pick(tools, "ledger_gap").run(input)).toEqual({ calcId: "calc:ledger-1", ...computeGap(input) });
  });

  it("retake_value runs the engine over listed colleges with the best official score", async () => {
    const data = jordanData();
    const tiers = [{ label: "Presidential", minGpa: 3.5, minAct: 30, minSat: null, annualUsd: 4000, renewalGpa: 3 }];
    const college = { ...first(data.colleges), meritTiers: tiers };
    const unofficial = {
      ...first(data.testScores),
      id: "99999999-9999-4999-8999-999999999902",
      composite: 31,
      official: false,
    };
    const port = createFakePort({ colleges: [college], testScores: [...data.testScores, unofficial] });
    const retake = pick(specialistTools("prep", port, JORDAN.ownerId, "crew"), "retake_value");
    const out = await retake.run({ test: "ACT", targetComposite: 30 });
    const expected = retakeAnalysis({
      colleges: [college],
      gpa: 3.72,
      currentAct: 29,
      currentSat: null,
      target: { test: "ACT", composite: 30 },
    });
    expect(out).toEqual({ calcId: "calc:prep-1", ...expected });
    expect(out).toMatchObject({ currentComposite: 29, totalFourYearDeltaUsd: 16_000 });
    await expect(retake.run({ test: "ACT", targetComposite: 40 })).rejects.toThrow("ACT composites run 1 to 36.");
  });
});

describe("shared helpers", () => {
  it("numbers calc ids per prefix", () => {
    const register = calcRegistry("prep");
    expect([register("retake_value"), register("retake_value")]).toEqual(["calc:prep-1", "calc:prep-2"]);
  });

  it("logs a rejected usage write and still flushes", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const usage = usageReporter(
      {
        model: createScriptedModelClient([]),
        port: createFakePort(),
        now: () => new Date(0),
        onUsage: () => Promise.reject(new Error("insert failed")),
      },
      "scout",
    );
    usage.onTurn({
      content: [],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 24 },
      model: "claude-opus-5-5",
      durationMs: 5,
    });
    await expect(usage.flush()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"msg":"agents.usage_failed"'));
    log.mockRestore();
  });
});
