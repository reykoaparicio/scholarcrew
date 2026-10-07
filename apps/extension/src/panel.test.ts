import { beforeEach, describe, expect, it } from "vitest";
import { detectFields } from "./fields";
import { type Proposal, buildProposals } from "./fill";
import { PANEL_HOST_ID, type PanelHandle, showReviewPanel } from "./panel";
import { control, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function press(panel: PanelHandle, text: string): void {
  const button = [...panel.root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!button) throw new Error(`no button ${text}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function box(panel: PanelHandle, proposal: Proposal | undefined): HTMLInputElement {
  const el = panel.root.querySelector(`input[data-proposal-id="${proposal?.id}"]`);
  if (!(el instanceof HTMLInputElement)) throw new Error("no checkbox");
  return el;
}

function formValues(form: HTMLFormElement): string[] {
  return [...form.elements].map((el) => (el as HTMLInputElement).value);
}

describe("review panel", () => {
  let form: HTMLFormElement;
  let proposals: Proposal[];

  beforeEach(() => {
    form = mountForm();
    proposals = buildProposals(detectFields(document), PROFILE);
  });

  it("lists every proposal with its field and value inside a closed shadow root", () => {
    const panel = showReviewPanel(document, proposals);
    expect(panel.host.id).toBe(PANEL_HOST_ID);
    expect(panel.host.shadowRoot).toBeNull();
    const rows = [...panel.root.querySelectorAll(".row")];
    expect(rows).toHaveLength(9);
    expect(rows[0]?.querySelector(".field")?.textContent).toBe("Full name");
    expect(rows[0]?.querySelector(".value")?.textContent).toBe("Maya Torres");
    expect(panel.root.textContent).toContain("Nothing is submitted");
  });

  it("checks empty fields and leaves filled ones on an unchecked Replace box", () => {
    const panel = showReviewPanel(document, proposals);
    const city = proposals.find((p) => p.key === "city");
    expect(box(panel, city).checked).toBe(false);
    const cityRow = box(panel, city).closest(".row");
    expect(cityRow?.querySelector(".choice")?.textContent).toBe("Replace");
    expect(cityRow?.querySelector(".note")?.textContent).toBe("Now: “Springfield”");
    for (const p of proposals.filter((x) => !x.filled)) expect(box(panel, p).checked).toBe(true);
  });

  it("Cancel closes the panel and changes nothing", () => {
    const before = formValues(form);
    const events: string[] = [];
    form.addEventListener("input", () => events.push("input"));
    form.addEventListener("change", () => events.push("change"));
    const panel = showReviewPanel(document, proposals);
    press(panel, "Cancel");
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
    expect(formValues(form)).toEqual(before);
    expect(events).toEqual([]);
  });

  it("Fill selected fills the checked fields and keeps the filled city", () => {
    const panel = showReviewPanel(document, proposals);
    box(
      panel,
      proposals.find((p) => p.key === "gpa"),
    ).checked = false;
    press(panel, "Fill selected");
    expect(control("full-name").value).toBe("Maya Torres");
    expect(control<HTMLSelectElement>("state").value).toBe("TX");
    expect(control("gpa_unweighted").value).toBe("");
    expect(control("city").value).toBe("Springfield");
    expect(panel.root.querySelector(".status")?.textContent).toBe(
      "Filled 7 fields. Check the form, then submit it yourself.",
    );
    expect(panel.root.querySelectorAll(".row")).toHaveLength(0);
    press(panel, "Close");
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });

  it("replaces a filled field only when Replace is ticked", () => {
    const panel = showReviewPanel(document, proposals);
    box(
      panel,
      proposals.find((p) => p.key === "city"),
    ).checked = true;
    press(panel, "Fill selected");
    expect(control("city").value).toBe("Austin");
    expect(panel.root.querySelector(".status")?.textContent).toBe(
      "Filled 9 fields. Check the form, then submit it yourself.",
    );
  });

  it("says so when nothing matches and offers only Close", () => {
    const panel = showReviewPanel(document, []);
    expect(panel.root.textContent).toContain("No fields on this page match your profile.");
    expect([...panel.root.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Close"]);
    press(panel, "Close");
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });

  it("replaces an open panel instead of stacking a second one", () => {
    showReviewPanel(document, proposals);
    showReviewPanel(document, proposals);
    expect(document.querySelectorAll(`#${PANEL_HOST_ID}`)).toHaveLength(1);
  });

  it("renders page-provided labels as text, never as HTML", () => {
    const [first] = proposals;
    if (!first) throw new Error("fixture");
    const hostile = { ...first, field: { ...first.field, label: `<img src=x onerror="alert(1)">` } };
    const panel = showReviewPanel(document, [hostile]);
    expect(panel.root.querySelector("img")).toBeNull();
    expect(panel.root.querySelector(".field")?.textContent).toBe(`<img src=x onerror="alert(1)">`);
  });

  it("uses type=button for every panel button", () => {
    const panel = showReviewPanel(document, proposals);
    for (const b of panel.root.querySelectorAll("button")) expect(b.type).toBe("button");
  });
});
