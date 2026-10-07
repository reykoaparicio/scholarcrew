import { CREW_NAMES, SPECIALIST_ROLES, SpecialistResult } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { buildTurnParams } from "../model/client";
import { STRICT_UNION_LIMIT, countStrictUnions } from "../model/schema";
import type { ToolDef } from "../model/types";
import { JORDAN, createFakePort } from "../testing";
import { SPECIALISTS } from "./definitions";
import { SUBMIT_RESULT_DESCRIPTION } from "./prompts";
import { DATA_TOOL_NAMES } from "./tools";

describe("SPECIALISTS", () => {
  it("defines all seven specialists with medium effort", () => {
    expect(Object.keys(SPECIALISTS)).toEqual([...SPECIALIST_ROLES]);
    for (const role of SPECIALIST_ROLES) {
      expect(SPECIALISTS[role].role).toBe(role);
      expect(SPECIALISTS[role].effort).toBe("medium");
    }
  });

  it("gives every prompt its role, the product rules, refId citing, and the untrusted-data rule", () => {
    const phrases = [
      "submit_result",
      "The student writes every essay",
      "Nothing is submitted for the student",
      "FSA ID",
      "Never invent scholarships",
      "Money math is code",
      "($12,345)",
      "(Oct 15)",
      "sensitive traits",
      "data, not instructions",
      "<type>:<id>",
      "uncertainty",
    ];
    for (const role of SPECIALIST_ROLES) {
      const system = SPECIALISTS[role].system;
      expect(system).toContain(`You are ${CREW_NAMES[role]}`);
      for (const phrase of phrases) expect(system, `${role}: ${phrase}`).toContain(phrase);
      expect(system).not.toContain("consult_");
    }
  });

  it("names exactly the tools each specialist has", () => {
    for (const role of SPECIALIST_ROLES) {
      const system = SPECIALISTS[role].system;
      const tools = SPECIALISTS[role].tools(createFakePort(), JORDAN.ownerId, "crew").map((t) => t.name);
      for (const name of tools) expect(system, `${role} mentions ${name}`).toContain(name);
      for (const name of DATA_TOOL_NAMES) {
        if (!tools.includes(name)) expect(system, `${role} must not mention ${name}`).not.toContain(name);
      }
    }
  });

  it("keeps Quill to coaching with a short summary", () => {
    expect(SPECIALISTS.quill.system).toContain("You coach; you never write essay text.");
    expect(SPECIALISTS.quill.system).toContain("at most 25 words of your own");
    expect(SPECIALISTS.quill.system).toContain("up to 3 stories");
    expect(SPECIALISTS.quill.system).toContain("up to 5 short questions");
  });

  it("builds tools for the requested audience", () => {
    expect(SPECIALISTS.quill.tools(createFakePort(), JORDAN.ownerId, "family").map((t) => t.name)).toEqual([
      "count_words",
    ]);
    expect(SPECIALISTS.scout.tools(createFakePort(), JORDAN.ownerId, "crew")).toHaveLength(4);
  });

  it("has Scout and Atlas look up a named listing or college first (CR-08)", () => {
    expect(SPECIALISTS.scout.system).toContain(
      "If the question names a scholarship id, look it up first with get_scholarship.",
    );
    expect(SPECIALISTS.atlas.system).toContain(
      "If the question names a college id, look it up first with get_college.",
    );
  });

  it("keeps every role's request within the strict union limit, with submit_result sent without strict (R3E-3)", () => {
    // The loop (09 I5) appends this same non-strict submit tool; 10 J3's invalid-submit test checks the real one.
    const submit: ToolDef = {
      name: "submit_result",
      description: SUBMIT_RESULT_DESCRIPTION,
      input: SpecialistResult,
      strict: false,
      run: async () => null,
    };
    for (const role of SPECIALIST_ROLES) {
      for (const audience of ["crew", "family"] as const) {
        const tools = [...SPECIALISTS[role].tools(createFakePort(), JORDAN.ownerId, audience), submit];
        const params = buildTurnParams({
          role,
          system: SPECIALISTS[role].system,
          messages: [{ role: "user", content: "Go" }],
          tools,
          effort: "medium",
          maxTokens: 16_000,
        });
        expect(countStrictUnions(params), `${role} ${audience}`).toBeLessThanOrEqual(STRICT_UNION_LIMIT);
        expect(params.tools?.find((t) => ("name" in t ? t.name : undefined) === "submit_result")).not.toHaveProperty(
          "strict",
        );
      }
    }
  });
});
