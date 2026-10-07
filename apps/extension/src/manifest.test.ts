import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

describe("manifest.json", () => {
  it("is MV3 named ScholarCrew", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("ScholarCrew");
  });

  it("asks for exactly storage, activeTab, and scripting", () => {
    expect(manifest.permissions).toHaveLength(3);
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "scripting", "storage"]);
  });

  it("asks for no host access and runs no content script on its own", () => {
    const keys = Object.keys(manifest);
    for (const key of [
      "host_permissions",
      "optional_host_permissions",
      "optional_permissions",
      "content_scripts",
      "externally_connectable",
      "web_accessible_resources",
    ]) {
      expect(keys).not.toContain(key);
    }
  });

  it("points at the built background worker and popup", () => {
    expect(manifest.background).toEqual({ service_worker: "background.js" });
    expect(manifest.action.default_popup).toBe("popup.html");
  });
});
