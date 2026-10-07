/**
 * Postgres SQLSTATE of a failed query ("23505" for a unique violation), or undefined.
 * drizzle 0.44 wraps driver errors in DrizzleQueryError with the PostgresError as `cause`, so this walks the chain.
 */
export function pgErrorCode(e: unknown): string | undefined {
  let current: unknown = e;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}
