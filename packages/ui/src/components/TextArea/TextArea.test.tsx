import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  it("renders a labelled textarea with 4 rows by default", () => {
    render(<TextArea label="Story" />);
    const area = screen.getByLabelText("Story") as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.rows).toBe(4);
  });

  it("links the hint and respects rows", () => {
    render(<TextArea label="Story" hint="A few sentences is enough." rows={6} />);
    const area = screen.getByLabelText("Story") as HTMLTextAreaElement;
    expect(area.rows).toBe(6);
    expect(document.getElementById(area.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "A few sentences is enough.",
    );
  });
});
