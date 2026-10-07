import { describe, expect, it } from "vitest";
import { createTestDeps, fixedClock } from "../shared";
import { consumeRateLimit, waitText } from "./index";

const rule = { key: "ml:ip:203.0.113.9", limit: 5, windowSeconds: 900 };

describe("consumeRateLimit", () => {
  it("allows the limit and refuses the next call", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await consumeRateLimit(deps, rule);
    await expect(consumeRateLimit(deps, rule)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("counts keys separately", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await consumeRateLimit(deps, rule);
    await expect(consumeRateLimit(deps, { ...rule, key: "ml:ip:203.0.113.10" })).resolves.toBeUndefined();
  });

  it("starts a new window after windowSeconds", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    for (let n = 0; n < 5; n += 1) await consumeRateLimit(deps, rule);
    clock.set("2026-10-06T15:15:00.000Z");
    await expect(consumeRateLimit(deps, rule)).resolves.toBeUndefined();
  });

  it("is atomic under concurrent calls", async () => {
    const deps = createTestDeps();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeRateLimit(deps, rule)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  });

  it("says how long to wait, in details and in the message (R3A-11)", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const crew = { key: "crew:u1", limit: 2, windowSeconds: 600 };
    await consumeRateLimit(deps, crew);
    await consumeRateLimit(deps, crew);
    await expect(consumeRateLimit(deps, crew)).rejects.toMatchObject({
      code: "rate_limited",
      message: "Too many requests. Try again in 10 minutes.",
      details: { retryAfterSeconds: 600 },
    });
    clock.set("2026-10-06T15:01:40.000Z");
    await expect(consumeRateLimit(deps, crew)).rejects.toMatchObject({
      message: "Too many requests. Try again in 9 minutes.",
      details: { retryAfterSeconds: 500 },
    });
    expect([waitText(1), waitText(60), waitText(61), waitText(3599), waitText(3600), waitText(86_400)]).toEqual([
      "a minute",
      "a minute",
      "2 minutes",
      "60 minutes",
      "1 hour",
      "24 hours",
    ]);
  });
});
