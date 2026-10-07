import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table } from "./Table";

interface School {
  id: string;
  name: string;
  deadline: string;
  gapUsd: number;
}

const ROWS: School[] = [
  { id: "1", name: "State U", deadline: "Nov 1", gapUsd: 9200 },
  { id: "2", name: "Bay Tech", deadline: "Nov 15", gapUsd: 11900 },
];

describe("Table", () => {
  it("renders headers and plain cell values by key", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "School" },
          { key: "deadline", header: "Deadline" },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["School", "Deadline"]);
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["State U", "Nov 1", "Bay Tech", "Nov 15"]);
  });

  it("uses render functions and right alignment", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "School" },
          { key: "gap", header: "Gap / yr", align: "right", render: (r) => `$${r.gapUsd.toLocaleString("en-US")}` },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Gap / yr" }).classList.contains("r")).toBe(true);
    expect(screen.getByRole("cell", { name: "$9,200" }).classList.contains("r")).toBe(true);
  });

  it("names the table with a caption and marks the selected row", () => {
    render(
      <Table
        caption="Your colleges"
        columns={[{ key: "name", header: "School" }]}
        rows={ROWS}
        rowKey={(r) => r.id}
        selectedKey="1"
      />,
    );
    const rows = within(screen.getByRole("table", { name: "Your colleges" })).getAllByRole("row");
    expect(rows[1]?.classList.contains("sel")).toBe(true);
    expect(rows[2]?.classList.contains("sel")).toBe(false);
  });

  it("works without rowKey and leaves non-text values empty", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "School" },
          { key: "missing", header: "X" },
        ]}
        rows={ROWS}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByRole("cell")[1]?.textContent).toBe("");
  });
});
