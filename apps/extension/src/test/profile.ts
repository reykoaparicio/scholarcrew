import type { Activity, AutofillProfile, ScholarshipSummary } from "@scholarcrew/domain";

function activity(id: string, position: number, name: string, role: string, description: string): Activity {
  return {
    id,
    position,
    name,
    role,
    organization: "",
    description,
    hoursPerWeek: 4,
    weeksPerYear: 30,
    grades: [10, 11],
    category: "Community service",
  };
}

export const PROFILE: AutofillProfile = {
  displayName: "Maya Torres",
  email: "maya@example.com",
  highSchool: "Lakeview High School",
  classYear: 2027,
  city: "Austin",
  state: "TX",
  gpa: 3.8,
  intendedMajors: ["Biology", "Public Health"],
  activities: [
    activity("2b7e4c1a-5d3f-4e8a-9b6c-7d8e9f0a1b2c", 2, "Food bank", "Shift lead", "Run the Saturday sorting crew"),
    activity("8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", 1, "Robotics club", "Captain", "Lead a 12-person build team"),
  ],
};

export const SUMMARY: ScholarshipSummary = {
  id: "6a1d5c2e-3b4f-4a8e-9c7d-1e2f3a4b5c6d",
  slug: "lakeview-rotary-award",
  name: "Lakeview Rotary Award",
  provider: "Lakeview Rotary Club",
  amountMinUsd: 1000,
  amountMaxUsd: 1000,
  renewable: false,
  deadline: "2027-03-01",
  localLabel: "Austin, TX",
  status: "draft",
  verifiedAt: null,
  scamFlags: [],
  unverified: true,
  estMinutes: 30,
};
