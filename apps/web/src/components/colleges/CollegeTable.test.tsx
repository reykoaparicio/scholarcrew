// @vitest-environment jsdom
import type { CollegeListEntry } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCollegeButton, CollegeTable } from "./CollegeTable";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/colleges",
}));
afterEach(cleanup);

const entry = (o: Partial<CollegeListEntry> & { name: string }): CollegeListEntry => ({
  id: `id-${o.name}`,
  collegeId: `c-${o.name}`,
  college: {
    id: `c-${o.name}`,
    name: o.name,
    state: "TX",
    city: "Austin",
    control: "public",
    admitRate: 0.5,
    costOfAttendanceUsd: 27800,
    testPolicy: "optional",
  },
  fit: "target",
  plan: "EA",
  status: "researching",
  season: "2026-27",
  deadline: "2026-11-01",
  itemsDone: 3,
  itemsTotal: 5,
  gapUsd: 9200,
  outsidePolicy: "added_on_top",
  testPolicy: "optional",
  createdAt: "2026-10-01T15:00:00.000Z",
  ...o,
});

describe("CollegeTable", () => {
  it("shows fit, deadline by plan, checklist, tests, gap, and outside scholarship policy", () => {
    render(
      <CollegeTable
        entries={[
          entry({ name: "State U" }),
          entry({
            name: "Bay Tech",
            plan: "rolling",
            deadline: null,
            gapUsd: null,
            outsidePolicy: "may_reduce_grant",
            itemsDone: 4,
            itemsTotal: 4,
            testPolicy: "blind",
          }),
        ]}
        selectedId="id-State U"
      />,
    );
    const rows = screen.getAllByRole("row");
    const state = within(rows[1] as HTMLElement);
    expect(state.getByRole("link", { name: "State U" }).getAttribute("href")).toBe("/colleges/id-State U");
    expect(state.getByText("Target · public")).toBeTruthy();
    expect(state.getByText("Nov 1")).toBeTruthy();
    expect(state.getByText("Early Action")).toBeTruthy();
    expect(state.getByText("3 of 5")).toBeTruthy();
    expect(state.getByText("$9,200")).toBeTruthy();
    expect(state.getByText("Added on top of your aid")).toBeTruthy();
    const bay = within(rows[2] as HTMLElement);
    expect(bay.getByText("Rolling")).toBeTruthy();
    expect(bay.getByText("Rolling admission")).toBeTruthy();
    expect(bay.getByText("Done")).toBeTruthy();
    expect(bay.getByText("Not used")).toBeTruthy();
    expect(bay.getByText("Not estimated")).toBeTruthy();
    expect(bay.getByText("May lower the school's own grant")).toBeTruthy();
  });

  it("opens the add dialog", () => {
    render(<AddCollegeButton count={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a school" }));
    expect(screen.getByRole("dialog", { name: "Add a school" })).toBeTruthy();
  });
});
