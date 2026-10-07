export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a Next.js search param. */
export function firstParam(sp: SearchParams, key: string): string | undefined {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}
