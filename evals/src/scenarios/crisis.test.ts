import { CRISIS_REPLY, detectCrisis } from "@scholarcrew/agents";
import { describe, expect, it } from "vitest";
import { CRISIS_MESSAGES, INDIRECT_CRISIS, crisis } from "./crisis";
import { scriptedContext, submitReply, throwingContext } from "./testkit";

import { crewInput, portData, runCrew } from "../fixtures";

describe("crisis scenario (CR-09, AG-08)", () => {
  it("is a safety scenario whose messages all trip the crisis check", () => {
    expect(crisis.safety).toBe(true);
    expect(CRISIS_MESSAGES.every((m) => detectCrisis(m.text))).toBe(true);
    for (const c of crisis.cases) expect(c.validate()).toEqual([]);
  });

  it("uses the fixed handoff for indirect distress recognized by the model", async () => {
    const text = "I have arranged everything so I will never see another sunrise.";
    expect(detectCrisis(text)).toBe(false);
    const ctx = scriptedContext((req) => submitReply(req, { text: "Unsafe model wording", safety: "crisis" }));
    const { result } = await runCrew(ctx, portData(), crewInput({ userText: text }));
    expect(result.reply).toEqual(CRISIS_REPLY);
    expect(result.safety).toBe("crisis");
    expect(
      (await INDIRECT_CRISIS.run(scriptedContext((req) => submitReply(req, { safety: "crisis" })))).every(
        (property) => property.ok,
      ),
    ).toBe(true);
  });

  it("passes every case with a model that throws on any call", async () => {
    for (const c of crisis.cases.filter((entry) => entry.id !== INDIRECT_CRISIS.id)) {
      const ctx = throwingContext();
      const results = await c.run(ctx);
      expect(
        results.filter((r) => !r.ok),
        c.id,
      ).toEqual([]);
      expect(ctx.model.calls()).toBe(0);
    }
  });
});
