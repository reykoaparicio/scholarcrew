// @vitest-environment jsdom
import type { CollegeListEntry, HelperView } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelperSheet, gradesLabel, stageLabel } from "./HelperSheet";
import { calendarLong, instantLong } from "./dates";

afterEach(cleanup);

const NOW = "2026-10-06T15:00:00.000Z";

const brag: HelperView = {
  studentName: "Jordan Rivera",
  helperRole: "recommender",
  label: "Ms. Patel",
  expiresAt: "2026-11-05T17:00:00.000Z",
  activities: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      position: 1,
      name: "Robotics team",
      role: "Build lead",
      organization: "Maple High",
      description: "Designed the drivetrain for our regional finalist robot.",
      hoursPerWeek: 8,
      weeksPerYear: 30,
      grades: [9, 10, 11, 12],
      category: "STEM",
    },
  ],
  stories: [{ title: "Losing the regional final", summary: "Our robot failed in the last match. I led the rebuild." }],
  deadlines: null,
  colleges: null,
  scholarships: null,
  request: { message: null, dueDate: null },
};

const entry: CollegeListEntry = {
  id: "22222222-2222-4222-8222-222222222222",
  collegeId: "100001",
  college: {
    id: "100001",
    name: "Maple State University",
    state: "TX",
    city: "Maple City",
    control: "public",
    admitRate: 0.68,
    costOfAttendanceUsd: 24510,
    testPolicy: "optional",
  },
  fit: "target",
  plan: "EA",
  status: "applying",
  season: "2026-27",
  deadline: "2026-11-01",
  itemsDone: 3,
  itemsTotal: 7,
  gapUsd: 9200,
  outsidePolicy: "unknown",
  testPolicy: "optional",
  createdAt: "2026-09-01T00:00:00.000Z",
};

describe("dates", () => {
  it("formats calendar dates and instants with the year", () => {
    expect(calendarLong("2026-11-01")).toBe("Nov 1, 2026");
    expect(instantLong("2026-11-05T17:00:00.000Z")).toBe("Nov 5, 2026");
    expect(gradesLabel([9, 10, 11, 12])).toBe("grades 9–12");
    expect(gradesLabel([11])).toBe("grade 11");
    expect(gradesLabel([9, 11])).toBe("grades 9, 11");
    expect(gradesLabel([])).toBe("");
    // R3V-8: 02's stage map, narrowed from HelperView's string `stage`.
    expect(stageLabel("lost")).toBe("Didn't win");
    expect(stageLabel("planned")).toBe("Working on");
    expect(stageLabel("not-a-stage")).toBe("not-a-stage");
  });
});

describe("HelperSheet", () => {
  it("shows a recommender only the sections in the link's scope", () => {
    render(<HelperSheet view={brag} nowIso={NOW} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hi Ms. Patel. Here's Jordan's brag sheet.");
    expect(screen.getByText("Helper link · shared by Jordan Rivera")).toBeTruthy();
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.getByText("Expires Nov 5, 2026")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Activities" })).toBeTruthy();
    expect(screen.getByText("Robotics team")).toBeTruthy();
    expect(screen.getByText("Build lead · Maple High · grades 9–12 · 8 h/wk")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stories Jordan chose to share" })).toBeTruthy();
    expect(screen.getByText("Losing the regional final")).toBeTruthy();
    for (const name of ["Deadlines", "College list", "Scholarships"]) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
    for (const item of [
      "Essays and drafts",
      "Crew chats",
      "Costs, aid, and family finances",
      "Private or sensitive details",
    ]) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "What Jordan is asking for" })).toBeNull();
  });

  it("shows the recommendation request first, with the note and the helpful-by date (D38, HL-02)", () => {
    render(
      <HelperSheet
        view={{ ...brag, request: { message: "Could you speak to my robotics leadership?", dueDate: "2026-10-25" } }}
        nowIso={NOW}
      />,
    );
    const ask = screen.getByRole("heading", { name: "What Jordan is asking for" });
    expect(screen.getByText("“Could you speak to my robotics leadership?”")).toBeTruthy();
    expect(screen.getByText("Helpful by Oct 25, 2026")).toBeTruthy();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings.indexOf(ask.textContent)).toBeLessThan(headings.indexOf("Activities"));
    cleanup();
    const { container } = render(
      <HelperSheet view={{ ...brag, request: { message: null, dueDate: "2026-10-25" } }} nowIso={NOW} />,
    );
    expect(screen.getByText("Helpful by Oct 25, 2026")).toBeTruthy();
    expect(container.textContent).not.toContain("“");
  });

  it("shows a counselor deadlines, colleges, and item status, never costs", () => {
    const counselor: HelperView = {
      ...brag,
      helperRole: "counselor",
      label: "Mr. Lee",
      activities: null,
      stories: null,
      deadlines: [
        {
          kind: "application",
          title: "Maple State EA application",
          dueOn: "2026-11-01",
          daysLeft: 26,
          refType: "college_list",
          refId: entry.id,
          valueUsd: null,
          warning: false,
        },
      ],
      colleges: [entry],
      scholarships: [{ name: "Maple STEM Award", deadline: "2026-10-15", stage: "drafting" }],
    };
    const { container } = render(<HelperSheet view={counselor} nowIso={NOW} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Hi Mr. Lee. Here's where Jordan's applications stand.",
    );
    expect(screen.getByText("Maple State EA application")).toBeTruthy();
    expect(screen.getByText("Nov 1 · 26 days")).toBeTruthy();
    expect(screen.getByText("Maple State University")).toBeTruthy();
    expect(screen.getByText("Early Action · Applying · 3 of 7 items done")).toBeTruthy();
    expect(screen.getByText("Maple STEM Award")).toBeTruthy();
    // R3V-8: stage words come from 02 APPLICATION_STAGE_LABELS (the student's wording).
    expect(screen.getByText("Working on · due Oct 15")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Activities" })).toBeNull();
    expect(container.textContent).not.toContain("$9,200");
    expect(container.textContent).not.toContain("$24,510");
  });

  it("warns when the link is about to expire and handles empty sections", () => {
    render(<HelperSheet view={{ ...brag, activities: [], expiresAt: "2026-10-08T15:00:00.000Z" }} nowIso={NOW} />);
    expect(screen.getByText("Expires in 2 days")).toBeTruthy();
    expect(screen.getByText("Nothing shared here yet.")).toBeTruthy();
  });
});
