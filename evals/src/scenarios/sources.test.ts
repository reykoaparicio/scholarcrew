import { describe, expect, it } from "vitest";
import { JORDAN } from "../fixtures";
import { sources } from "./sources";
import { caseById, scriptedContext, submitReply } from "./testkit";

describe("sources scenario (CR-04, AG-08)", () => {
  it("has valid fixtures", () => {
    for (const c of sources.cases) expect(c.validate()).toEqual([]);
  });

  it("passes a reply whose dated claim has a receipt pointing at a real fact", async () => {
    const ctx = scriptedContext((req) =>
      submitReply(req, {
        text: "Start with the Hill Country STEM Award, due Oct 15. It's open to students in your county.",
        receipt: [
          { kind: "fact", label: "Home county", refId: `fact:${JORDAN.factId}`, sourceUrl: null, verifiedAt: null },
        ],
      }),
    );
    const results = await caseById(sources, "scholarships-this-week").run(ctx);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it("fails a reply that states an amount with no receipt", async () => {
    const ctx = scriptedContext((req) => submitReply(req, { text: "Your gap at UT Austin is $9,200 a year." }));
    const results = await caseById(sources, "gap-at-college").run(ctx);
    expect(results.find((r) => r.property === "a reply that states amounts or dates shows what it used")?.ok).toBe(
      false,
    );
  });
});
