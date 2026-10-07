import { describe, expect, it } from "vitest";
import { pct, usd, usdCompact } from "./format";

describe("usd", () => {
  it("formats whole dollars with thousands commas", () => {
    expect(usd(18600)).toBe("$18,600");
    expect(usd(0)).toBe("$0");
    expect(usd(9200.4)).toBe("$9,200");
  });
});

describe("usdCompact", () => {
  it("formats axis ticks", () => {
    expect(usdCompact(0)).toBe("$0");
    expect(usdCompact(500)).toBe("$500");
    expect(usdCompact(20000)).toBe("$20k");
    expect(usdCompact(12500)).toBe("$12.5k");
  });
});

describe("pct", () => {
  it("rounds a share to one decimal", () => {
    expect(pct(18600, 27800)).toBe(66.9);
    expect(pct(9200, 27800)).toBe(33.1);
    expect(pct(18600, 80000)).toBe(23.3);
  });

  it("returns 0 for empty, zero, or negative inputs", () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(0, 100)).toBe(0);
    expect(pct(-5, 100)).toBe(0);
  });
});
