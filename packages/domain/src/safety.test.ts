import { describe, expect, it } from "vitest";
import { CrewReply } from "./crew";
import { CRISIS_REPLY, detectCrisis } from "./safety";

describe("crisis keyword floor", () => {
  it("catches normalized English and Spanish danger phrases", () => {
    for (const text of [
      "kms",
      "unalive",
      "don't want to be here anymore",
      "don't wanna to be alive anymore",
      "want to hurt myself",
      "wanna to kill myself",
      "going to kill myself",
      "overdose",
      "overdosing",
      "quiero morir",
      "quiero morirme",
      "me quiero matar",
      "me quiero morir",
      "matarme",
      "suicidarme",
      "suicidio",
      "suicidarse",
      "no quiero vivir",
      "no quiero seguir viviendo",
      "no quiero estar aquí",
      "hacerme daño",
      "lastimarme",
      "quitarme la vida",
      "acabar con mi vida",
      "kill my self",
      "kill\u200bmyself",
    ]) {
      expect(detectCrisis(text), text).toBe(true);
    }
  });
  it("keeps hyperbole out and provides a valid bilingual reply", () => {
    for (const text of ["kill me now", "me muero de risa", "this essay is killing me", "I could die laughing"])
      expect(detectCrisis(text)).toBe(false);
    expect(CrewReply.safeParse(CRISIS_REPLY).success).toBe(true);
    expect(CRISIS_REPLY.text).toContain("988");
    expect(CRISIS_REPLY.text).toContain("En español");
  });
});
