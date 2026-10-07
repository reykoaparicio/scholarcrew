import { localLabel } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { addDays, escapeLike, firstName, hoursFromMinutes, isUuid, monthOf } from "./common";
import { slugify } from "./labels";
import { isStale } from "./mappers";

// `todayIn` is 06's shared copy (R3V-9); its test lives in `shared/shared.test.ts`.
describe("calendar helpers", () => {
  it("adds days across month ends and reads the month", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-06", -6)).toBe("2026-09-30");
    expect(monthOf("2026-10-06")).toBe("2026-10");
  });
});

describe("labels", () => {
  it("labels national, state, county, and city listings", () => {
    expect(localLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: [] })).toBe("Texas");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple County"], cities: [] })).toBe(
      "Maple County, TX",
    );
    expect(localLabel({ national: false, state: "TX", counties: [], cities: ["Cedar Park"] })).toBe("Cedar Park, TX");
  });

  it("slugifies names", () => {
    expect(slugify("Maple County Rotary Club — STEM Award!")).toBe("maple-county-rotary-club-stem-award");
    expect(slugify("Beca Fundación Niños")).toBe("beca-fundacion-ninos");
    expect(slugify("!!!")).toBe("scholarship");
  });
});

describe("small helpers", () => {
  it("escapes LIKE wildcards, checks UUIDs, converts minutes, reads first names", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("maple-rotary")).toBe(false);
    expect(hoursFromMinutes(90)).toBe(1.5);
    expect(hoursFromMinutes(100)).toBe(1.7);
    expect(firstName("Maya Reyes")).toBe("Maya");
    expect(firstName("  ")).toBe("A student");
  });

  it("treats stale status or a verification older than 30 days as stale", () => {
    const now = new Date("2026-10-06T15:00:00.000Z");
    expect(isStale({ status: "stale", verifiedAt: now }, now)).toBe(true);
    expect(isStale({ status: "published", verifiedAt: new Date("2026-09-01T00:00:00.000Z") }, now)).toBe(true);
    expect(isStale({ status: "published", verifiedAt: new Date("2026-09-20T00:00:00.000Z") }, now)).toBe(false);
    expect(isStale({ status: "published", verifiedAt: null }, now)).toBe(false);
  });
});
