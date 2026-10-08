import { type AutofillProfile, STATE_NAMES, USState } from "@scholarcrew/domain";
import {
  type DetectedField,
  type FillableElement,
  type ProfileKey,
  isFillable,
  isSelect,
  isTextArea,
  matchField,
  profileValue,
} from "./fields";

export interface Proposal {
  id: string;
  field: DetectedField;
  key: ProfileKey;
  /** What gets written (the option value for selects). */
  value: string;
  /** What the student sees in the review panel (the option text for selects). */
  display: string;
  currentValue: string;
  filled: boolean;
}

/** Profiles store two-letter codes; many forms list full state names (STATE_NAMES from the domain, D41). */
export function findOption(select: HTMLSelectElement, value: string): HTMLOptionElement | null {
  const trimmed = value.trim();
  const wanted = new Set([trimmed.toLowerCase()]);
  const code = USState.safeParse(trimmed.toUpperCase());
  if (code.success) wanted.add(STATE_NAMES[code.data].toLowerCase());
  for (const option of select.options) {
    if (option.disabled || option.parentElement?.matches("optgroup:disabled")) continue;
    if (wanted.has(option.value.trim().toLowerCase()) || wanted.has(option.text.trim().toLowerCase())) return option;
  }
  return null;
}

export function buildProposals(fields: DetectedField[], profile: AutofillProfile): Proposal[] {
  const proposals: Proposal[] = [];
  for (const field of fields) {
    const key = matchField(field);
    if (key === null) continue;
    const raw = profileValue(profile, key, isTextArea(field.element));
    if (raw === null) continue;
    let value = raw;
    let display = raw;
    if (isSelect(field.element)) {
      const option = findOption(field.element, raw);
      if (!option) continue;
      value = option.value;
      display = option.text.trim();
    }
    const currentValue = field.element.value;
    if (currentValue === value) continue;
    proposals.push({
      id: `p${proposals.length}`,
      field,
      key,
      value,
      display,
      currentValue,
      filled: currentValue.trim() !== "",
    });
  }
  return proposals;
}

function setNativeValue(el: FillableElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

/** Writes one value. Never touches a non-empty field unless replace is true. Never submits. */
export function fillField(el: FillableElement, value: string, options: { replace: boolean }): boolean {
  if (!isFillable(el)) return false;
  if (el.value.trim() !== "" && !options.replace) return false;
  let next = value;
  if (isSelect(el)) {
    const option = findOption(el, value);
    if (!option) return false;
    next = option.value;
  }
  setNativeValue(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function applyProposals(proposals: Proposal[], selected: ReadonlySet<string>): number {
  let count = 0;
  for (const proposal of proposals) {
    if (!selected.has(proposal.id)) continue;
    if (proposal.field.element.value !== proposal.currentValue) continue;
    if (fillField(proposal.field.element, proposal.value, { replace: proposal.filled })) count += 1;
  }
  return count;
}
