import { SENSITIVE_ORDER, sensitiveValue, splitList } from "@/lib/sensitive";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import { type OnboardingInput, type SensitiveKind, type USState, US_STATES } from "@scholarcrew/domain";

export type StepIndex = 0 | 1 | 2 | 3 | 4;
export const STEP_TITLES = [
  "About you",
  "Grades and interests",
  "Matching opt-ins",
  "Starter uploads",
  "Colleges and family",
] as const;
export const MAX_ONBOARDING_COLLEGES = 15;
export const DRAFT_KEY = "sc:onboarding";

export interface CollegePick {
  id: string;
  name: string;
  state: string;
}

export interface OnboardingDraft {
  displayName: string;
  birthYear: string;
  classYear: string;
  highSchool: string;
  state: string;
  county: string;
  city: string;
  timeZone: string;
  gpa: string;
  majors: string;
  interests: string;
  sensitive: Record<SensitiveKind, { enabled: boolean; value: string }>;
  colleges: CollegePick[];
  parentEmail: string;
}

export type StepErrors = Partial<Record<string, string>>;

function noSensitive(): OnboardingDraft["sensitive"] {
  const out = {} as OnboardingDraft["sensitive"];
  for (const kind of SENSITIVE_ORDER) out[kind] = { enabled: false, value: "" };
  return out;
}

export function emptyDraft(o: { displayName?: string; timeZone?: string }): OnboardingDraft {
  return {
    displayName: o.displayName ?? "",
    birthYear: "",
    classYear: "",
    highSchool: "",
    state: "",
    county: "",
    city: "",
    timeZone: o.timeZone ?? DEFAULT_TIME_ZONE,
    gpa: "",
    majors: "",
    interests: "",
    sensitive: noSensitive(),
    colleges: [],
    parentEmail: "",
  };
}

function intIn(raw: string, min: number, max: number): number | null {
  if (!/^\d{4}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUnder13(birthYear: number, now: Date): boolean {
  return now.getUTCFullYear() - birthYear < 13;
}

export function validateStep(step: StepIndex, d: OnboardingDraft, now: Date): StepErrors {
  const e: StepErrors = {};
  if (step === 0) {
    const name = d.displayName.trim();
    if (!name) e.displayName = "Tell us what to call you";
    else if (name.length > 80) e.displayName = "Keep it under 80 characters";
    if (intIn(d.birthYear, 1900, now.getUTCFullYear()) === null)
      e.birthYear = "Enter the year you were born, like 2009";
    if (intIn(d.classYear, 2020, 2040) === null) e.classYear = "Enter your high school graduation year";
    if (!d.highSchool.trim()) e.highSchool = "Enter your high school";
    if (!(US_STATES as readonly string[]).includes(d.state)) e.state = "Pick your state";
    if (!d.county.trim()) e.county = "Enter your county";
    if (!d.timeZone) e.timeZone = "Pick your time zone";
  }
  if (step === 1) {
    if (d.gpa.trim()) {
      const gpa = Number(d.gpa);
      if (!Number.isFinite(gpa) || gpa < 0 || gpa > 5) e.gpa = "GPA is a number from 0 to 5, like 3.72";
    }
    if (splitList(d.majors, 99).length > 5) e.majors = "List up to 5 majors";
    if (splitList(d.interests, 99).length > 10) e.interests = "List up to 10 interests";
  }
  if (step === 2) {
    const income = d.sensitive.income_range;
    if (income.enabled && sensitiveValue("income_range", income.value) === null) {
      e.income_range = "Pick a range or turn this off";
    }
  }
  if (step === 4) {
    if (d.colleges.length > MAX_ONBOARDING_COLLEGES) e.colleges = "Pick up to 15 colleges for now";
    if (d.parentEmail.trim() && !EMAIL.test(d.parentEmail.trim()))
      e.parentEmail = "Enter a valid email or leave it blank";
  }
  return e;
}

/** The POST /onboarding body. Only opt-ins that are on are sent (ON-04: all start off). */
export function buildInput(d: OnboardingDraft): OnboardingInput {
  const gpa = d.gpa.trim() ? Math.round(Number(d.gpa) * 100) / 100 : null;
  return {
    displayName: d.displayName.trim(),
    birthYear: Number(d.birthYear),
    classYear: Number(d.classYear),
    highSchool: d.highSchool.trim(),
    state: d.state as USState,
    county: d.county.trim(),
    city: d.city.trim(),
    gpaUnweighted: gpa,
    intendedMajors: splitList(d.majors, 5).map((v) => v.slice(0, 80)),
    interests: splitList(d.interests, 10).map((v) => v.slice(0, 60)),
    timeZone: d.timeZone,
    collegeIds: d.colleges.slice(0, MAX_ONBOARDING_COLLEGES).map((c) => c.id),
    sensitive: SENSITIVE_ORDER.filter((kind) => d.sensitive[kind].enabled).map((kind) => ({
      kind,
      enabled: true,
      value: sensitiveValue(kind, d.sensitive[kind].value),
    })),
  };
}

/** What we keep in localStorage between visits: everything except sensitive opt-ins. */
export function draftForStorage(d: OnboardingDraft): Omit<OnboardingDraft, "sensitive"> {
  const { sensitive: _omit, ...rest } = d;
  return rest;
}

export function restoreDraft(raw: string | null, base: OnboardingDraft): OnboardingDraft {
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof OnboardingDraft, unknown>>;
    const text = (k: keyof OnboardingDraft): string =>
      typeof parsed[k] === "string" ? (parsed[k] as string) : (base[k] as string);
    const colleges = Array.isArray(parsed.colleges)
      ? (parsed.colleges as unknown[]).filter(
          (c): c is CollegePick =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as CollegePick).id === "string" &&
            typeof (c as CollegePick).name === "string",
        )
      : base.colleges;
    return {
      ...base,
      displayName: text("displayName"),
      birthYear: text("birthYear"),
      classYear: text("classYear"),
      highSchool: text("highSchool"),
      state: text("state"),
      county: text("county"),
      city: text("city"),
      timeZone: text("timeZone"),
      gpa: text("gpa"),
      majors: text("majors"),
      interests: text("interests"),
      parentEmail: text("parentEmail"),
      colleges: colleges.slice(0, MAX_ONBOARDING_COLLEGES),
      sensitive: base.sensitive,
    };
  } catch {
    return base;
  }
}

/** Stepper subtitles, like "Class of 2027 · Maple High School". */
export function stepSummary(step: StepIndex, d: OnboardingDraft): string {
  if (step === 0)
    return d.classYear && d.highSchool ? `Class of ${d.classYear} · ${d.highSchool}` : "Name, school, where you live";
  if (step === 1) {
    const first = splitList(d.interests, 1)[0];
    return [d.gpa ? `GPA ${d.gpa}` : "GPA optional", first].filter(Boolean).join(" · ");
  }
  if (step === 2) {
    const on = SENSITIVE_ORDER.filter((k) => d.sensitive[k].enabled).length;
    return on === 0 ? "Optional · all start off" : `${on} on`;
  }
  if (step === 3) return "Transcript, past essays";
  return d.colleges.length > 0
    ? `${d.colleges.length} ${d.colleges.length === 1 ? "college" : "colleges"}`
    : "Your list, invite a parent";
}
