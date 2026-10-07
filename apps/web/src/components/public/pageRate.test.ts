import { eq, rateLimits } from "@scholarcrew/db";
import { useTestDeps } from "@test/helpers";
import { describe, expect, it, vi } from "vitest";
import { allowPageRequest } from "./pageRate";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.99, 203.0.113.7" }),
}));

const deps = useTestDeps();

describe("allowPageRequest", () => {
  it("charges the same per-IP bucket as the API route (right-most hop) and stops at the limit", async () => {
    const rate = { key: "helper-view", limit: 2, windowSeconds: 3600 };
    expect(await allowPageRequest(rate)).toBe(true);
    expect(await allowPageRequest(rate)).toBe(true);
    expect(await allowPageRequest(rate)).toBe(false);
    const rows = await deps().db.select().from(rateLimits).where(eq(rateLimits.key, "helper-view:203.0.113.7"));
    expect(rows).toHaveLength(1);
  });
});
