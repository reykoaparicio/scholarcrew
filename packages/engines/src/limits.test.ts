import { describe, expect, it } from "vitest";
import { countChars, countWords, limitState } from "./limits";

// Draft 2 of the Rotary essay from design/mockups/source/04_essays.html (footnote markers removed).
const ROTARY_DRAFT = [
  "I have always been passionate about robotics. In ninth grade I joined our school's robotics team, and by junior year I was the build lead. But the moment I'm proudest of didn't happen at a competition.",
  "Last spring, our librarian asked if the team could run a STEM night for elementary students. I said yes before I knew what I was signing up for. The first night, 30 kids came, and we had four robots and one extension cord.",
  "We kept going every other Thursday. I learned how to explain a motor controller to a nine-year-old, which is harder than building one. By May, some of the kids were building their own sensors and teaching their parents how they worked.",
  "Robotics taught me engineering, but the library nights taught me that knowing something is only half of it. The other half is",
].join("\n\n");

describe("countWords", () => {
  it("counts the Rotary draft as 142 words", () => {
    expect(countWords(ROTARY_DRAFT)).toBe(142);
  });

  it("keeps hyphenated words and contractions whole", () => {
    expect(countWords("a nine-year-old")).toBe(2);
    expect(countWords("I'm sure it didn't")).toBe(4);
    expect(countWords("don’t stop")).toBe(2);
  });

  it("counts numbers, including decimals and thousands separators", () => {
    expect(countWords("30 kids came")).toBe(3);
    expect(countWords("I scored 3.72 and won $2,500.")).toBe(6);
  });

  it("splits on em dashes and ignores lone punctuation", () => {
    expect(countWords("half—it")).toBe(2);
    expect(countWords("a - b")).toBe(2);
    expect(countWords("Wait... what?!")).toBe(2);
  });

  it("returns 0 for empty, whitespace, or punctuation-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("... -- !!")).toBe(0);
  });

  it("counts non-Latin letters and combining accents", () => {
    expect(countWords("café señor 東京")).toBe(3);
    expect(countWords("cafe\u0301 au lait")).toBe(3); // decomposed é: letter + combining accent
  });
});

describe("countChars", () => {
  it("counts Unicode code points", () => {
    expect(countChars("")).toBe(0);
    expect(countChars("abc")).toBe(3);
    expect(countChars("é".repeat(150))).toBe(150);
    expect(countChars("\u{1F44B}\u{1F3FD}")).toBe(2); // waving hand + skin tone modifier
    expect(countChars("e\u0301")).toBe(2); // decomposed é is two code points, one grapheme
  });

  it("puts a 150-character activity description at the limit, not over", () => {
    expect(limitState(countChars("é".repeat(150)), 150)).toBe("near");
    expect(limitState(countChars("é".repeat(151)), 150)).toBe("over");
  });
});

describe("limitState", () => {
  it("is ok with no limit", () => {
    expect(limitState(10_000, null)).toBe("ok");
  });

  it("warns at 90% and flags anything over 100%", () => {
    expect(limitState(142, 500)).toBe("ok");
    expect(limitState(449, 500)).toBe("ok");
    expect(limitState(450, 500)).toBe("near");
    expect(limitState(500, 500)).toBe("near");
    expect(limitState(501, 500)).toBe("over");
    expect(limitState(0, 500)).toBe("ok");
  });
});
