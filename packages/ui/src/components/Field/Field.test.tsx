import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("associates the label with the control it renders", () => {
    render(<Field label="Nickname">{(control) => <input {...control} />}</Field>);
    expect(screen.getByLabelText("Nickname").tagName).toBe("INPUT");
  });

  it("links hint and error and marks the control invalid", () => {
    render(
      <Field label="Email" hint="We send a sign-in link." error="Enter a valid email.">
        {(control) => <input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "We send a sign-in link.",
      "Enter a valid email.",
    ]);
  });

  it("leaves a valid control without describedby or invalid", () => {
    render(<Field label="City">{(control) => <input {...control} />}</Field>);
    const input = screen.getByLabelText("City");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
