/** Receipt and card references are "<type>:<id>". */
export const REF_TYPES = ["fact", "record", "scholarship", "college", "essay", "story", "calc"] as const;
export type RefType = (typeof REF_TYPES)[number];

function isRefType(t: string): t is RefType {
  return (REF_TYPES as readonly string[]).includes(t);
}

export function refId(type: RefType, id: string): string {
  return `${type}:${id}`;
}

export function parseRefId(ref: string): { type: RefType; id: string } | null {
  const at = ref.indexOf(":");
  if (at <= 0) return null;
  const type = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (!id || !isRefType(type)) return null;
  return { type, id };
}

/** Ref for a record that carries its own refType (plan items, deadlines, room refs). Unknown types become "record". */
export function refFor(type: string, id: string): string {
  return isRefType(type) ? `${type}:${id}` : `record:${id}`;
}
