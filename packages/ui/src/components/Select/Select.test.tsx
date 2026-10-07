import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

const OPTIONS = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

describe("Select", () => {
  it("renders a labelled select with options", () => {
    render(<Select label="Control" options={OPTIONS} />);
    const select = screen.getByLabelText("Control") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Public", "Private"]);
  });

  it("adds a placeholder option and reports changes", () => {
    const onChange = vi.fn();
    render(<Select label="Control" options={OPTIONS} placeholder="Any" defaultValue="" onChange={onChange} />);
    const select = screen.getByLabelText("Control") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe("Any");
    fireEvent.change(select, { target: { value: "private" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select.value).toBe("private");
  });
});
