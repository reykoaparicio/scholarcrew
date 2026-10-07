import type { CrewRole } from "@scholarcrew/domain";

/** Validated categorical palette from design/mockups/source/styles.css, in the fixed crew order. */
export const CREW_COLORS: Record<CrewRole, string> = {
  compass: "#2a78d6",
  scout: "#eb6834",
  atlas: "#1baf7a",
  quill: "#eda100",
  aid: "#e87ba4",
  ledger: "#008300",
  prep: "#4a3aa7",
  impact: "#e34948",
};

/** Short duty shown beside each crew member in the sidebar roster. */
export const CREW_DUTIES: Record<CrewRole, string> = {
  compass: "coordinator",
  scout: "scholarships",
  atlas: "admissions",
  quill: "essays",
  aid: "financial aid",
  ledger: "money math",
  prep: "tests",
  impact: "service",
};
