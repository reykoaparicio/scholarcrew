import { describe, expect, it } from "vitest";
import { checkIntegrity } from "./integrity";

const words = (prefix: string, n: number) => Array.from({ length: n }, (_, k) => `${prefix}${k}`).join(" ");

describe("checkIntegrity", () => {
  it("blocks more than 25 words of new prose", () => {
    expect(checkIntegrity(words("new", 30), [])).toEqual({ ok: false, longestNewRun: 30 });
  });

  it("allows quoting the student's own words", () => {
    const student = words("quote", 40);
    expect(checkIntegrity(`You wrote: ${student}`, [student])).toEqual({ ok: true, longestNewRun: 4 });
  });

  it("measures each new stretch between quotes, ignoring case and punctuation", () => {
    const student = words("quote", 30);
    const output = `${words("new", 20)}, "${student.toUpperCase()}." ${words("more", 20)}`;
    expect(checkIntegrity(output, ["Unrelated text.", student])).toEqual({ ok: true, longestNewRun: 22 });
  });

  it("allows exactly 25 new words and handles short text", () => {
    expect(checkIntegrity(words("new", 25), []).ok).toBe(true);
    expect(checkIntegrity(words("new", 26), []).ok).toBe(false);
    expect(checkIntegrity("Nice start.", [])).toEqual({ ok: true, longestNewRun: 2 });
    expect(checkIntegrity("", [])).toEqual({ ok: true, longestNewRun: 0 });
  });
});
