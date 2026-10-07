import { describe, expect, it } from "vitest";
import { math } from "./math";
import { caseById, scriptedContext, submitReply } from "./testkit";

describe("math scenario (MO-03, AG-08)", () => {
  it("has valid fixtures whose answers come from the engine", () => {
    for (const c of math.cases) expect(c.validate()).toEqual([]);
  });

  it("passes a reply that uses Ledger's numbers", async () => {
    const ctx = scriptedContext((req) =>
      submitReply(req, { text: "If you win, your gap drops from $9,200 to $8,200 a year." }),
    );
    const results = await caseById(math, "gap-if-win").run(ctx);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it("fails a reply with a number Ledger never produced", async () => {
    const ctx = scriptedContext((req) => submitReply(req, { text: "Your gap would be about $7,900 a year." }));
    const results = await caseById(math, "gap-if-win").run(ctx);
    expect(results.find((r) => r.property === "every dollar amount matches Ledger's numbers")?.ok).toBe(false);
    expect(results.find((r) => r.property === "states the answer")?.ok).toBe(false);
  });
});
