import { CrewReply } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { CRISIS_REPLY, detectCrisis } from "./crisis";

describe("detectCrisis", () => {
  it("flags self-harm and crisis language", () => {
    const messages = [
      "I want to kill myself",
      "honestly I just want to die",
      "I've been thinking about suicide",
      "I feel suicidal tonight",
      "I keep hurting myself",
      "I started cutting myself again",
      "is self-harm normal when stressed",
      "There's no reason to live anymore",
      "I want to end my life",
      "everyone would be better off without me",
      "I don’t want to be alive anymore",
    ];
    for (const m of messages) expect(detectCrisis(m), m).toBe(true);
  });

  it("ignores everyday stress talk", () => {
    const messages = [
      "this essay is killing me",
      "The FAFSA deadline is killing me lol",
      "I'd die for a full ride",
      "our robot died at regionals",
      "Can you help me end this essay strongly?",
      "I could kill for a good topic sentence",
    ];
    for (const m of messages) expect(detectCrisis(m), m).toBe(false);
  });

  it("has a fixed, reviewed crisis reply", () => {
    expect(CrewReply.safeParse(CRISIS_REPLY).success).toBe(true);
    expect(CRISIS_REPLY.text).toContain("988");
    expect(CRISIS_REPLY.text).toContain("911");
    expect(CRISIS_REPLY).toMatchObject({
      contributors: ["compass"],
      question: null,
      actionCards: [],
      receipt: [],
      safety: "crisis",
      needsInput: false,
    });
  });
});
