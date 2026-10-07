export function errorLabel(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const e = error as Record<string, unknown>;
  return (
    ["code", "constraint", "table"]
      .flatMap((key) => (typeof e[key] === "string" ? [`${key}=${e[key]}`] : []))
      .join(" ") || "unknown"
  );
}
