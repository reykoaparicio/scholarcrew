import {
  compareOffers,
  computeGap,
  countChars,
  countWords,
  daysUntil,
  estimateLoanPayment,
} from "@scholarcrew/engines";
import { describe, expect, it, vi } from "vitest";
import { toStrictJsonSchema } from "../model/schema";
import type { ToolDef } from "../model/types";
import { CALCULATOR_NAMES, createCalculatorTools } from "./index";

const NOW = new Date("2026-10-06T15:00:00.000Z");

function setup() {
  let n = 0;
  const register = vi.fn(() => {
    n += 1;
    return `calc:${n}`;
  });
  const tools = createCalculatorTools({ now: () => NOW, timeZone: "America/Chicago", register });
  const tool = (name: string): ToolDef => {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`missing tool ${name}`);
    return found;
  };
  return { tools, tool, register };
}

describe("createCalculatorTools", () => {
  it("returns the five calculators with strict-ready schemas", () => {
    const { tools } = setup();
    expect(tools.map((t) => t.name)).toEqual([...CALCULATOR_NAMES]);
    for (const t of tools) {
      const schema = toStrictJsonSchema(t.input);
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it("ledger_gap runs the engine and registers a calc id", async () => {
    const { tool, register } = setup();
    const input = { costOfAttendanceUsd: 31_000, freeMoneyUsd: 21_800, pendingUsd: 1000 };
    expect(await tool("ledger_gap").run(input)).toEqual({ calcId: "calc:1", ...computeGap(input) });
    expect(register).toHaveBeenCalledWith("ledger_gap");
  });

  it("ledger_compare_offers and ledger_loan_payment delegate to the engines", async () => {
    const { tool } = setup();
    const offers = [
      {
        offerId: "o1",
        collegeId: "228778",
        collegeName: "UT Austin",
        costOfAttendanceUsd: 31_000,
        lines: [
          { amountUsd: 12_000, category: "grant" as const, renewable: true },
          { amountUsd: 5500, category: "loan_federal_subsidized" as const, renewable: false },
        ],
      },
    ];
    expect(await tool("ledger_compare_offers").run({ offers })).toEqual({ calcId: "calc:1", ...compareOffers(offers) });
    const loan = { principalUsd: 27_000, annualRatePct: 6.39, years: 10 };
    expect(await tool("ledger_loan_payment").run(loan)).toEqual({ calcId: "calc:2", ...estimateLoanPayment(loan) });
  });

  it("count_words and days_until use the student's time zone and today", async () => {
    const { tool } = setup();
    const text = "When our robot died at regionals, we rebuilt it.";
    expect(await tool("count_words").run({ text })).toEqual({
      calcId: "calc:1",
      words: countWords(text),
      chars: countChars(text),
    });
    expect(await tool("days_until").run({ date: "2026-10-15" })).toEqual({
      calcId: "calc:2",
      days: daysUntil("2026-10-15", NOW, "America/Chicago"),
    });
    expect(await tool("days_until").run({ date: "2026-10-15" })).toMatchObject({ days: 9 });
  });

  it("validates inputs with zod", () => {
    const { tool } = setup();
    expect(
      tool("ledger_gap").input.safeParse({ costOfAttendanceUsd: -1, freeMoneyUsd: 0, pendingUsd: 0 }).success,
    ).toBe(false);
    expect(
      tool("ledger_loan_payment").input.safeParse({ principalUsd: 1000, annualRatePct: 5, years: 0 }).success,
    ).toBe(false);
    expect(tool("ledger_compare_offers").input.safeParse({ offers: [] }).success).toBe(false);
    expect(tool("days_until").input.safeParse({ date: "10/15/2026" }).success).toBe(false);
  });
});
