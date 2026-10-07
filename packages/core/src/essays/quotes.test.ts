import { describe, expect, it } from "vitest";
import { occurrenceIndex } from "./quotes";

describe("occurrenceIndex", () => {
  it("finds the nth exact occurrence or returns -1", () => {
    expect(occurrenceIndex("a b a b a", "a", 1)).toBe(0);
    expect(occurrenceIndex("a b a b a", "a", 3)).toBe(8);
    expect(occurrenceIndex("a b a b a", "a", 4)).toBe(-1);
    expect(occurrenceIndex("Thirty kids came", "thirty kids", 1)).toBe(-1);
    expect(occurrenceIndex("anything", "", 1)).toBe(-1);
    expect(occurrenceIndex("anything", "any", 0)).toBe(-1);
  });
});
