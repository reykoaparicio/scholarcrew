import { describe, expect, it } from "vitest";
import { US_STATES } from "./common";
import { STATE_NAMES, localLabel } from "./geo";

describe("geo labels", () => {
  it("names every state code", () => {
    expect(Object.keys(STATE_NAMES).sort()).toEqual([...US_STATES].sort());
    expect(STATE_NAMES.TX).toBe("Texas");
    expect(STATE_NAMES.DC).toBe("District of Columbia");
  });

  it("labels national, state, county, and city listings", () => {
    expect(localLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: null, counties: [], cities: [] })).toBe("National");
    expect(localLabel({ national: false, state: "TX", counties: [], cities: [] })).toBe("Texas");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple"], cities: [] })).toBe("Maple County, TX");
    expect(localLabel({ national: false, state: "TX", counties: ["Maple County"], cities: [] })).toBe(
      "Maple County, TX",
    );
    expect(localLabel({ national: false, state: "TX", counties: [], cities: ["Cedar Park"] })).toBe("Cedar Park, TX");
  });
});
