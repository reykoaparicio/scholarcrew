import { CrewReply, SpecialistResult } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { costMicros } from "./cost";
import { STRICT_UNION_LIMIT, countStrictUnions, toStrictJsonSchema } from "./schema";
import type { MessageCreateParams } from "./types";

type Node = Record<string, unknown>;

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (node === null || typeof node !== "object") return;
  visit(node as Node);
  for (const child of Object.values(node)) walk(child, visit);
}

function objectNodes(schema: unknown): Node[] {
  const found: Node[] = [];
  walk(schema, (n) => {
    if (n.type === "object") found.push(n);
  });
  return found;
}

function keysUsed(schema: unknown): Set<string> {
  const keys = new Set<string>();
  walk(schema, (n) => {
    for (const k of Object.keys(n)) keys.add(k);
  });
  return keys;
}

function expectStrictObjects(schema: Record<string, unknown>): void {
  const objects = objectNodes(schema);
  expect(objects.length).toBeGreaterThan(0);
  for (const o of objects) {
    expect(o.additionalProperties).toBe(false);
    const props = (o.properties ?? {}) as Record<string, unknown>;
    expect([...((o.required as string[]) ?? [])].sort()).toEqual(Object.keys(props).sort());
  }
}

describe("costMicros", () => {
  it("prices input 4, output 20, cache read 0.2, cache write 5 micro-dollars per token, rounded", () => {
    expect(costMicros({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 10_000, cacheWriteTokens: 2000 })).toBe(
      26_000,
    );
    expect(costMicros({ inputTokens: 1, outputTokens: 0, cacheReadTokens: 3, cacheWriteTokens: 0 })).toBe(5);
    expect(costMicros({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 2, cacheWriteTokens: 0 })).toBe(0);
  });
});

describe("toStrictJsonSchema", () => {
  it("drops $schema and makes every CrewReply object strict", () => {
    const schema = toStrictJsonSchema(CrewReply);
    expect(schema.$schema).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual([
      "text",
      "contributors",
      "question",
      "actionCards",
      "receipt",
      "safety",
      "needsInput",
    ]);
    expectStrictObjects(schema);
  });

  it("makes every SpecialistResult object strict", () => {
    const schema = toStrictJsonSchema(SpecialistResult);
    expect(schema.required).toEqual([
      "role",
      "summary",
      "proposedActions",
      "factsUsed",
      "uncertainty",
      "needsPermission",
    ]);
    expectStrictObjects(schema);
  });

  it("strips constraints strict tools don't support and uses anyOf for unions", () => {
    const keys = keysUsed(toStrictJsonSchema(CrewReply));
    for (const k of ["$schema", "minimum", "maximum", "minLength", "maxLength", "pattern", "maxItems", "oneOf"]) {
      expect(keys.has(k)).toBe(false);
    }
    expect(keys.has("anyOf")).toBe(true);
  });

  it("marks optional and defaulted fields required, including in non-strict nested objects", () => {
    const schema = toStrictJsonSchema(
      z.strictObject({
        a: z.string().optional(),
        b: z.number().default(1),
        nested: z.object({ c: z.boolean().optional() }),
      }),
    );
    expect(schema.required).toEqual(["a", "b", "nested"]);
    const nested = (schema.properties as Record<string, Node>).nested;
    expect(nested?.required).toEqual(["c"]);
    expect(nested?.additionalProperties).toBe(false);
  });

  it("keeps supported string formats and minItems up to 1, drops the rest", () => {
    const schema = toStrictJsonSchema(
      z.strictObject({
        day: z.iso.date(),
        id: z.cuid(),
        one: z.array(z.string()).min(1),
        three: z.array(z.string()).min(3),
      }),
    );
    const props = schema.properties as Record<string, Node>;
    expect(props.day?.format).toBe("date");
    expect(props.id?.format).toBeUndefined();
    expect(props.one?.minItems).toBe(1);
    expect(props.three?.minItems).toBeUndefined();
  });
});

describe("countStrictUnions", () => {
  it("counts anyOf and type-array nodes in strict tools and the JSON output, and skips tools sent without strict", () => {
    const schema = toStrictJsonSchema(
      z.strictObject({ a: z.string().nullable(), b: z.union([z.string(), z.number()]), c: z.string() }),
    );
    const tool = (name: string, strict: boolean) => ({
      name,
      description: name,
      input_schema: schema,
      ...(strict ? { strict } : {}),
    });
    const params = (o: Record<string, unknown>) =>
      ({
        model: "claude-opus-5-5",
        max_tokens: 1,
        messages: [],
        fallbacks: "default",
        ...o,
      }) as unknown as MessageCreateParams;
    expect(STRICT_UNION_LIMIT).toBe(16);
    expect(countStrictUnions(params({ tools: [tool("one", true), tool("two", true)] }))).toBe(4);
    expect(countStrictUnions(params({ tools: [tool("one", true), tool("loose", false)] }))).toBe(2);
    expect(
      countStrictUnions(params({ output_config: { effort: "low", format: { type: "json_schema", schema } } })),
    ).toBe(2);
    const typeArray = { type: "object", properties: { x: { type: ["string", "null"] } } };
    expect(
      countStrictUnions(params({ tools: [{ name: "raw", description: "", input_schema: typeArray, strict: true }] })),
    ).toBe(1);
  });
});
