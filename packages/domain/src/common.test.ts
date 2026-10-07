import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  AwardYear,
  DEFAULT_SHARED,
  ERROR_STATUS,
  HttpUrl,
  IsoDate,
  IsoDateTime,
  SHARE_CATEGORIES,
  USState,
  Usd,
  awardYearFor,
  isAppError,
  notFound,
  pageOf,
} from "./common";

describe("AppError", () => {
  it("maps each code to its HTTP status", () => {
    expect(new AppError("not_found", "x").status).toBe(404);
    expect(new AppError("limit_reached", "x").status).toBe(402);
    expect(new AppError("rate_limited", "x").status).toBe(429);
    expect(ERROR_STATUS.invalid_input).toBe(400);
  });

  it("is recognized by isAppError and helpers", () => {
    const e = notFound("Scholarship not found");
    expect(isAppError(e)).toBe(true);
    expect(e.code).toBe("not_found");
    expect(e.message).toBe("Scholarship not found");
    expect(isAppError(new Error("plain"))).toBe(false);
  });
});

describe("primitives", () => {
  it("accepts calendar dates and ISO instants only", () => {
    expect(IsoDate.safeParse("2026-10-15").success).toBe(true);
    expect(IsoDate.safeParse("10/15/2026").success).toBe(false);
    expect(IsoDateTime.safeParse("2026-10-06T15:00:00.000Z").success).toBe(true);
    expect(IsoDateTime.safeParse("2026-10-06").success).toBe(false);
  });

  it("keeps money as whole non-negative dollars", () => {
    expect(Usd.safeParse(9200).success).toBe(true);
    expect(Usd.safeParse(9200.5).success).toBe(false);
    expect(Usd.safeParse(-1).success).toBe(false);
  });

  it("knows US state codes including DC and PR", () => {
    expect(USState.safeParse("TX").success).toBe(true);
    expect(USState.safeParse("DC").success).toBe(true);
    expect(USState.safeParse("PR").success).toBe(true);
    expect(USState.safeParse("ZZ").success).toBe(false);
  });

  it("shares the low-risk categories by default only", () => {
    expect(SHARE_CATEGORIES).toHaveLength(9);
    expect(DEFAULT_SHARED.deadlines).toBe(true);
    expect(DEFAULT_SHARED.activities).toBe(true);
    expect(DEFAULT_SHARED.essays).toBe(false);
    expect(DEFAULT_SHARED.chats).toBe(false);
    expect(DEFAULT_SHARED.sensitive).toBe(false);
  });

  it("builds page schemas", () => {
    const P = pageOf(z.string());
    expect(P.parse({ items: ["a"], page: 1, pageSize: 20, total: 1 }).items).toEqual(["a"]);
    expect(P.safeParse({ items: [], page: 0, pageSize: 20, total: 0 }).success).toBe(false);
  });

  it("maps a season to the award year it pays for (R3V-7)", () => {
    expect(awardYearFor("2026-27")).toBe("2027-28");
    expect(awardYearFor("2099-00")).toBe("2100-01");
    expect(AwardYear.safeParse(awardYearFor("2026-27")).success).toBe(true);
  });
});

describe("HttpUrl", () => {
  it("accepts HTTP(S) and refuses executable schemes", () => {
    expect(HttpUrl.safeParse("https://example.org/apply").success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://example.org"])
      expect(HttpUrl.safeParse(url).success).toBe(false);
  });
});
