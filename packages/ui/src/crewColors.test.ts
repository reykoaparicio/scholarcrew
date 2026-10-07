import { readFileSync } from "node:fs";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { CREW_ROLES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { CREW_COLORS, CREW_DUTIES } from "./crewColors";

const tokens = readFileSync(fileURLToPath(new NodeURL("./tokens.css", import.meta.url)), "utf8");

describe("CREW_COLORS", () => {
  it("has exactly the 8 crew roles in the fixed categorical order", () => {
    expect(Object.keys(CREW_COLORS)).toEqual([...CREW_ROLES]);
  });

  it("uses the validated palette from styles.css", () => {
    expect(CREW_COLORS).toEqual({
      compass: "#2a78d6",
      scout: "#eb6834",
      atlas: "#1baf7a",
      quill: "#eda100",
      aid: "#e87ba4",
      ledger: "#008300",
      prep: "#4a3aa7",
      impact: "#e34948",
    });
  });

  it("matches the --c-<role> tokens in tokens.css", () => {
    for (const role of CREW_ROLES) {
      expect(tokens).toMatch(new RegExp(`--c-${role}:\\s*${CREW_COLORS[role]};`, "i"));
    }
  });

  it("keeps the money series on palette slots 1 and 2", () => {
    expect(tokens).toMatch(/--free:\s*#2a78d6;/i);
    expect(tokens).toMatch(/--gap:\s*#eb6834;/i);
  });
});

describe("CREW_DUTIES", () => {
  it("has a short duty for every crew role", () => {
    expect(Object.keys(CREW_DUTIES)).toEqual([...CREW_ROLES]);
    expect(CREW_DUTIES.compass).toBe("coordinator");
    expect(CREW_DUTIES.ledger).toBe("money math");
  });
});
