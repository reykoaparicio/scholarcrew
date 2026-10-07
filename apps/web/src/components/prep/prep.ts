import { addDaysIso, dateShort, minutesLabel } from "@/lib/format";
import { COMPOSITE_RANGE, type StudySession, type TestKind } from "@scholarcrew/domain";

/** Defined once in the college model (Q16) and shared with the college page; re-exported for the prep page. */
export { bestOfficial } from "../colleges/colleges";

/** Section keys match plan 04's superscore: ACT english/math/reading/science, SAT and PSAT rw/math. */
export const SECTIONS: Record<TestKind, Array<{ key: string; label: string }>> = {
  ACT: [
    { key: "english", label: "English" },
    { key: "math", label: "Math" },
    { key: "reading", label: "Reading" },
    { key: "science", label: "Science" },
  ],
  SAT: [
    { key: "rw", label: "Reading and Writing" },
    { key: "math", label: "Math" },
  ],
  PSAT: [
    { key: "rw", label: "Reading and Writing" },
    { key: "math", label: "Math" },
  ],
};
const SECTION_LABEL: Record<string, string> = {
  english: "English",
  math: "Math",
  reading: "Reading",
  science: "Science",
  rw: "Reading and Writing",
};

export function sectionsText(sections: Record<string, number>): string {
  return Object.entries(sections)
    .map(([key, value]) => `${SECTION_LABEL[key] ?? key} ${value}`)
    .join(" · ");
}

export function parseTarget(test: "ACT" | "SAT", text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  const range = COMPOSITE_RANGE[test];
  return n >= range.min && n <= range.max ? n : null;
}

/** Monday of the week containing a calendar date. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return addDaysIso(day, -((weekday + 6) % 7));
}

const WEEKLY: Array<{ title: string; minutes: number; offset: number }> = [
  { title: "Reading: timed passages", minutes: 25, offset: 1 },
  { title: "Math: review missed problems", minutes: 25, offset: 3 },
  { title: "One timed section, then review", minutes: 30, offset: 5 },
];

/** PR-04: three sessions a week from next Monday until the day before the test, at most 40. */
export function proposeStudyPlan(today: string, testDate: string): StudySession[] {
  const sessions: StudySession[] = [];
  for (let week = addDaysIso(mondayOf(today), 7); week < testDate && sessions.length < 40; week = addDaysIso(week, 7)) {
    for (const s of WEEKLY) {
      const dueOn = addDaysIso(week, s.offset);
      if (dueOn >= testDate || sessions.length >= 40) continue;
      sessions.push({ title: s.title, minutes: s.minutes, weekStart: week, dueOn });
    }
  }
  return sessions;
}

export function planSummary(sessions: StudySession[], testDate: string): string {
  const first = sessions[0]?.weekStart;
  const perWeek = sessions.filter((s) => s.weekStart === first).reduce((sum, s) => sum + s.minutes, 0);
  return `${minutesLabel(perWeek)} a week until ${dateShort(testDate)}`;
}
