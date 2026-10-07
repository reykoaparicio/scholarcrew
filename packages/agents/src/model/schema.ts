import { z } from "zod";
import type { MessageCreateParams } from "./types";

/**
 * Union-typed nodes (anyOf or a type array) allowed across one request's strict schemas (R3E-3).
 * Assumed from the structured-output limits; 00 §14 says to confirm it against current Anthropic docs at execution.
 */
export const STRICT_UNION_LIMIT = 16;
/** Keywords strict tools and JSON outputs reject. Zod still enforces them when the input comes back. */
const DROPPED_KEYWORDS = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "propertyNames",
]);

const SUPPORTED_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

/** Keywords whose value is a subschema (or a list of them). */
const SUBSCHEMA_KEYWORDS = new Set(["items", "prefixItems", "anyOf", "oneOf", "allOf", "not"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function mapValues(v: unknown, fn: (x: unknown) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(v)) return out;
  for (const [k, x] of Object.entries(v)) out[k] = fn(x);
  return out;
}

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    if (key === "minItems" && value !== 0 && value !== 1) continue;
    if (key === "format" && !(typeof value === "string" && SUPPORTED_FORMATS.has(value))) continue;
    if (key === "properties" || key === "$defs" || key === "definitions") {
      out[key] = mapValues(value, strictify);
      continue;
    }
    const target = key === "oneOf" ? "anyOf" : key;
    out[target] = SUBSCHEMA_KEYWORDS.has(key) ? strictify(value) : value;
  }
  const isObject = out.type === "object" || (Array.isArray(out.type) && out.type.includes("object"));
  if (isObject || isPlainObject(out.properties)) {
    const props = isPlainObject(out.properties) ? out.properties : {};
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

/**
 * JSON schema for a strict tool or a JSON output: z.toJSONSchema, then every object gets
 * additionalProperties false and every key required, and unsupported keywords are removed.
 * Records (objects without fixed keys) become empty strict objects, so don't use them in model schemas.
 * Model-facing schemas use `.nullable()` for absent values, never `.optional()`.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return strictify(z.toJSONSchema(schema)) as Record<string, unknown>;
}

function countUnionNodes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, child) => n + countUnionNodes(child), 0);
  if (!isPlainObject(node)) return 0;
  let n = Array.isArray(node.anyOf) || Array.isArray(node.type) ? 1 : 0;
  for (const child of Object.values(node)) n += countUnionNodes(child);
  return n;
}

/** Union-typed nodes across the request's strict tools (strict: true) and its JSON output schema. Non-strict tools don't count. */
export function countStrictUnions(params: MessageCreateParams): number {
  let n = 0;
  for (const t of (params.tools ?? []) as Array<{ strict?: boolean; input_schema?: unknown }>) {
    if (t.strict === true) n += countUnionNodes(t.input_schema);
  }
  const format = (params.output_config as { format?: { schema?: unknown } | null } | undefined)?.format;
  if (format) n += countUnionNodes(format.schema);
  return n;
}
