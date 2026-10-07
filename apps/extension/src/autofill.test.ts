import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleContentMessage, startAutofill } from "./autofill";
import { PANEL_HOST_ID, type PanelHandle } from "./panel";
import { control, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function press(panel: PanelHandle, text: string): void {
  const button = [...panel.root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!button) throw new Error(`no button ${text}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("handleContentMessage", () => {
  beforeEach(() => {
    mountForm();
  });

  it("shows the review panel for a valid show-review message and reports the count", () => {
    expect(handleContentMessage(document, { type: "show-review", profile: PROFILE })).toEqual({
      ok: true,
      proposals: 9,
    });
    expect(document.getElementById(PANEL_HOST_ID)).not.toBeNull();
    expect(control("full-name").value).toBe("");
  });

  it.each([
    [{ type: "fill-everything" }],
    [{ type: "show-review", profile: { ...PROFILE, email: "nope" } }],
    [{ type: "show-review", profile: PROFILE, autoFill: true }],
    [null],
  ])("rejects %j without touching the page", (message) => {
    expect(handleContentMessage(document, message)).toEqual({ ok: false, error: "Unknown request" });
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });
});

describe("never submits, clicks, or sends page contents", () => {
  const spies = {
    submit: vi.fn(),
    requestSubmit: vi.fn(),
    click: vi.fn(),
    fetch: vi.fn(),
    xhrOpen: vi.fn(),
    beacon: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(spies.submit);
    vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(spies.requestSubmit);
    vi.spyOn(HTMLElement.prototype, "click").mockImplementation(spies.click);
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(spies.xhrOpen);
    vi.stubGlobal("fetch", spies.fetch);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: spies.beacon });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const spy of Object.values(spies)) spy.mockReset();
  });

  it("fills every field, including replacements, with no submit, click, or network call", () => {
    const form = mountForm();
    let submitEvents = 0;
    form.addEventListener("submit", () => {
      submitEvents += 1;
    });
    const { proposals, panel } = startAutofill(document, PROFILE);
    expect(proposals).toBe(9);
    for (const box of panel.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) box.checked = true;
    press(panel, "Fill selected");
    press(panel, "Close");
    expect(control("city").value).toBe("Austin");
    expect(submitEvents).toBe(0);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("has no source line that submits a form or clicks an element", () => {
    const dir = fileURLToPath(new NodeURL(".", import.meta.url));
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources).toContain("content.ts");
    for (const file of sources) {
      const code = readFileSync(join(dir, file), "utf8");
      expect(code, file).not.toMatch(/\.submit\(|requestSubmit|\.click\(|dispatchEvent\(new (Mouse|Submit)Event/);
    }
  });

  it("keeps network and storage access out of everything that runs in the page", () => {
    const dir = fileURLToPath(new NodeURL(".", import.meta.url));
    const pageSide = ["content.ts", "autofill.ts", "fields.ts", "fill.ts", "panel.ts", "messages.ts", "zod-config.ts"];
    for (const file of pageSide) {
      const code = readFileSync(join(dir, file), "utf8");
      expect(code, file).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|chrome\.storage|\.\/api"/);
    }
  });
});

describe("zod is configured before any schema is built", () => {
  it('makes import "./zod-config" the first import of every entry file, with no inline z.config', () => {
    const dir = fileURLToPath(new NodeURL(".", import.meta.url));
    expect(readFileSync(join(dir, "zod-config.ts"), "utf8")).toContain("z.config({ jitless: true });");
    for (const file of ["background.ts", "content.ts", "popup.ts"]) {
      const code = readFileSync(join(dir, file), "utf8");
      const firstImport = code.split("\n").find((line) => line.startsWith("import "));
      expect(firstImport, file).toBe('import "./zod-config";');
      expect(code, file).not.toContain("z.config(");
    }
  });
});
