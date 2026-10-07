import { readFileSync } from "node:fs";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as ui from "./index";

const EXPECTED = [
  "AppShell",
  "Badge",
  "Button",
  "CREW_COLORS",
  "CREW_DUTIES",
  "Card",
  "Chip",
  "CrewDot",
  "EmptyState",
  "Eyebrow",
  "Field",
  "GapBar",
  "HeroNumber",
  "ICON_NAMES",
  "Icon",
  "Kanban",
  "Modal",
  "OfferBars",
  "Progress",
  "Select",
  "StatusPill",
  "Table",
  "Tag",
  "TextArea",
  "TextInput",
  "Toggle",
  "Topbar",
  "Who",
];

describe("@scholarcrew/ui", () => {
  it("exports exactly the contract components and constants", () => {
    expect(Object.keys(ui).sort()).toEqual([...EXPECTED].sort());
  });

  it("exposes the package and tokens entry points", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new NodeURL("../package.json", import.meta.url)), "utf8")) as {
      exports: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    expect(pkg.exports).toEqual({ ".": "./src/index.ts", "./tokens.css": "./src/tokens.css" });
    expect(pkg.peerDependencies).toEqual({ react: "^19.1.0", "react-dom": "^19.1.0" });
  });
});
