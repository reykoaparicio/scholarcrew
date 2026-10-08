import type { Activity, AutofillProfile } from "@scholarcrew/domain";

export type ProfileKey =
  | "email"
  | "displayName"
  | "highSchool"
  | "classYear"
  | "gpa"
  | "city"
  | "state"
  | "intendedMajors"
  | "activities";

export type FillableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface DetectedField {
  element: FillableElement;
  /** Human-readable name shown in the review panel. */
  label: string;
  /** Normalized descriptor texts, most reliable first. */
  texts: string[];
}

const SUPPORTED_INPUT_TYPES = new Set(["text", "email", "search", "tel", "url", "number"]);

const OTHER_PERSON =
  /\b(parents?|guardian|mother|father|counselor|teacher|recommender|reference|emergency|siblings?)\b/;

const RULES: ReadonlyArray<{ key: ProfileKey; pattern: RegExp }> = [
  { key: "email", pattern: /\be ?mail\b/ },
  { key: "displayName", pattern: /\b(full name|your name|student name)\b/ },
  { key: "classYear", pattern: /\b(graduation year|year of graduation|class of|grad year)\b/ },
  { key: "highSchool", pattern: /\b(high school|school name)\b/ },
  { key: "gpa", pattern: /\bgpa\b/ },
  { key: "city", pattern: /\bcity\b/ },
  { key: "state", pattern: /\bstate\b/ },
  { key: "intendedMajors", pattern: /\b(intended majors?|majors?|field of study)\b/ },
  { key: "activities", pattern: /\b(activities|extracurriculars?)\b/ },
];

export function isSelect(el: FillableElement): el is HTMLSelectElement {
  return el.tagName === "SELECT";
}

export function isTextArea(el: FillableElement): el is HTMLTextAreaElement {
  return el.tagName === "TEXTAREA";
}

function isInput(el: FillableElement): el is HTMLInputElement {
  return el.tagName === "INPUT";
}

export function normalizeText(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isVisible(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden")) return false;
    if (view) {
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
  }
  return true;
}

export function isFillable(el: FillableElement): boolean {
  if (!el.isConnected || el.matches(":disabled") || el.closest("[inert]")) return false;
  if (isInput(el) && (!SUPPORTED_INPUT_TYPES.has(el.type) || el.readOnly)) return false;
  if (isTextArea(el) && el.readOnly) return false;
  return isVisible(el);
}

function labelText(label: Element): string {
  const clone = label.cloneNode(true);
  if (!(clone instanceof Element)) return "";
  for (const inner of clone.querySelectorAll("input, select, textarea, button")) inner.remove();
  return clone.textContent ?? "";
}

/** Raw descriptor sources in priority order, paired with whether they're readable enough to display. */
function descriptorSources(el: FillableElement, doc: Document): Array<{ text: string; readable: boolean }> {
  const sources: Array<{ text: string; readable: boolean }> = [];
  if (el.id) {
    for (const label of doc.querySelectorAll("label")) {
      if (label.htmlFor === el.id) sources.push({ text: labelText(label), readable: true });
    }
  }
  const wrapping = el.closest("label");
  if (wrapping) sources.push({ text: labelText(wrapping), readable: true });
  sources.push({ text: el.getAttribute("aria-label") ?? "", readable: true });
  const labelledBy = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const labelledText = labelledBy.map((id) => doc.getElementById(id)?.textContent ?? "").join(" ");
  sources.push({ text: labelledText, readable: true });
  sources.push({ text: el.getAttribute("name") ?? "", readable: false });
  sources.push({ text: el.id, readable: false });
  sources.push({ text: el.getAttribute("placeholder") ?? "", readable: true });
  for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === "FIELDSET") {
      const legend = Array.from(ancestor.children).find((child) => child.tagName === "LEGEND");
      if (legend) sources.push({ text: legend.textContent ?? "", readable: false });
    }
  }
  return sources;
}

function describeField(el: FillableElement, doc: Document): DetectedField {
  const sources = descriptorSources(el, doc);
  const texts: string[] = [];
  for (const source of sources) {
    const normalized = normalizeText(source.text);
    if (normalized && !texts.includes(normalized)) texts.push(normalized);
  }
  const readable = sources.find((s) => s.readable && collapse(s.text) !== "");
  const label = readable ? collapse(readable.text) : (texts[0] ?? "Unnamed field");
  return { element: el, label, texts };
}

export function detectFields(doc: Document): DetectedField[] {
  const fields: DetectedField[] = [];
  for (const el of doc.querySelectorAll<FillableElement>("input, select, textarea")) {
    if (isFillable(el)) fields.push(describeField(el, doc));
  }
  return fields;
}

export function matchField(field: DetectedField): ProfileKey | null {
  if (field.texts.some((text) => OTHER_PERSON.test(text))) return null;
  for (const text of field.texts) {
    for (const rule of RULES) {
      if (rule.pattern.test(text)) {
        // The profile exposes only unweighted GPA on a 4.0 scale. Do not infer conversions.
        if (rule.key === "gpa") {
          if (field.texts.some((descriptor) => /\b(weighted|percentage|percent)\b/.test(descriptor))) return null;
          for (const descriptor of field.texts) {
            if (!/\b(gpa|scale|points?|out of)\b/.test(descriptor)) continue;
            const numbers = descriptor.match(/\b\d+\b/g) ?? [];
            if (numbers.some((number) => number !== "4" && number !== "0")) return null;
          }
          if (isInput(field.element) && field.element.max !== "" && Number(field.element.max) !== 4) return null;
        }
        return rule.key;
      }
    }
  }
  return null;
}

export function formatActivity(activity: Activity): string {
  let line = activity.name;
  if (activity.role) line = `${line} — ${activity.role}`;
  if (activity.description) line = `${line}: ${activity.description}`;
  return line;
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The value to propose for a key, or null when the profile has nothing for it. */
export function profileValue(profile: AutofillProfile, key: ProfileKey, multiline: boolean): string | null {
  switch (key) {
    case "email":
      return orNull(profile.email);
    case "displayName":
      return orNull(profile.displayName);
    case "highSchool":
      return orNull(profile.highSchool);
    case "classYear":
      return profile.classYear === null ? null : String(profile.classYear);
    case "gpa":
      return profile.gpa === null ? null : profile.gpa.toFixed(2);
    case "city":
      return orNull(profile.city);
    case "state":
      return orNull(profile.state);
    case "intendedMajors":
      return orNull(profile.intendedMajors.join(", "));
    case "activities": {
      const lines = [...profile.activities].sort((a, b) => a.position - b.position).map(formatActivity);
      return orNull(lines.join(multiline ? "\n" : "; "));
    }
  }
}
