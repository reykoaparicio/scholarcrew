import { createHash } from "node:crypto";

/** Fixed dev-only tokens so the seeded helper links and hours-verification request can be opened locally. */
export const SEED_TOKENS = {
  patelHelperLink: "seed-helper-link-patel".padEnd(43, "0"),
  okaforHelperLink: "seed-helper-link-okafor".padEnd(43, "0"),
  riveraVerification: "seed-verify-hours-rivera".padEnd(43, "0"),
} as const;

export const at = (iso: string): Date => new Date(iso);

export const daysFromNow = (days: number): Date => new Date(Date.now() + days * 86_400_000);

/** Same hashing as core's sha256Hex, so the tokens above resolve. */
export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seed insert into ${what} returned no row`);
  return row;
}
