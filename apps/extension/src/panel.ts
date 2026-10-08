import { type Proposal, applyProposals } from "./fill";

export const PANEL_HOST_ID = "scholarcrew-review";

export interface PanelHandle {
  host: HTMLElement;
  root: ShadowRoot;
  close(): void;
}

const PANEL_CSS = `
:host { all: initial; }
.panel {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  box-sizing: border-box; width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
  padding: 16px; background: #ffffff; color: #1f2933;
  border: 1px solid #d0d7de; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.title { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.lede, .empty, .status { margin: 0 0 12px; color: #52606d; }
.status { color: #1f2933; }
.rows { list-style: none; margin: 0 0 12px; padding: 0; }
.row { border-top: 1px solid #e4e7eb; padding: 8px 0; }
.row label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.row input { margin-top: 3px; }
.text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.field { font-weight: 600; }
.value { white-space: pre-line; overflow-wrap: anywhere; }
.choice, .note { font-size: 12px; color: #52606d; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #1f6feb; cursor: pointer; }
.primary { background: #1f6feb; color: #ffffff; }
.secondary { background: #ffffff; color: #1f6feb; }
`;

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(doc: Document, text: string, kind: "primary" | "secondary"): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = kind;
  button.textContent = text;
  return button;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function closeReviewPanel(doc: Document): void {
  doc.getElementById(PANEL_HOST_ID)?.remove();
}

/**
 * Shows the review panel. Filling happens only when the student presses "Fill selected".
 * The panel never submits a form, never clicks page buttons, and never makes network requests.
 */
export function showReviewPanel(doc: Document, proposals: Proposal[]): PanelHandle {
  closeReviewPanel(doc);
  const host = doc.createElement("div");
  host.id = PANEL_HOST_ID;
  const root = host.attachShadow({ mode: "closed" });
  const close = () => host.remove();

  const style = doc.createElement("style");
  style.textContent = PANEL_CSS;
  const panel = el(doc, "section", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "ScholarCrew autofill review");
  panel.append(
    el(doc, "h2", "title", "Review before filling"),
    el(doc, "p", "lede", "Nothing is submitted. Check each value and fill the ones you want."),
  );
  const actions = el(doc, "div", "actions");

  if (proposals.length === 0) {
    panel.append(el(doc, "p", "empty", "No fields on this page match your profile."));
    const closeButton = makeButton(doc, "Close", "secondary");
    closeButton.addEventListener("click", close);
    actions.append(closeButton);
  } else {
    const list = el(doc, "ul", "rows");
    const boxes = new Map<string, HTMLInputElement>();
    for (const proposal of proposals) {
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.checked = !proposal.filled;
      box.dataset.proposalId = proposal.id;
      boxes.set(proposal.id, box);
      const text = el(doc, "span", "text");
      text.append(
        el(doc, "span", "field", proposal.field.label),
        el(doc, "span", "value", proposal.display),
        el(doc, "span", "choice", proposal.filled ? "Replace" : "Fill"),
      );
      if (proposal.filled) text.append(el(doc, "span", "note", `Now: “${shorten(proposal.currentValue, 80)}”`));
      const label = doc.createElement("label");
      label.append(box, text);
      const row = el(doc, "li", "row");
      row.append(label);
      list.append(row);
    }
    const status = el(doc, "p", "status");
    status.setAttribute("role", "status");
    const fillButton = makeButton(doc, "Fill selected", "primary");
    const cancelButton = makeButton(doc, "Cancel", "secondary");
    fillButton.addEventListener("click", () => {
      const selected = new Set<string>();
      for (const [id, box] of boxes) {
        if (box.checked) selected.add(id);
      }
      const count = applyProposals(proposals, selected);
      list.remove();
      fillButton.remove();
      cancelButton.textContent = "Close";
      status.textContent = `Filled ${count} ${count === 1 ? "field" : "fields"}. Check the form, then submit it yourself.`;
    });
    cancelButton.addEventListener("click", close);
    panel.append(list, status);
    actions.append(fillButton, cancelButton);
  }

  panel.append(actions);
  root.append(style, panel);
  (doc.body ?? doc.documentElement).append(host);
  return { host, root, close };
}
