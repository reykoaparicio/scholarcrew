import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("renders a labelled text input", () => {
    render(<TextInput label="Email" name="email" placeholder="you@example.com" />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.name).toBe("email");
    expect(input.placeholder).toBe("you@example.com");
  });

  it("passes type and change events through", () => {
    const onChange = vi.fn();
    render(<TextInput label="Email" type="email" onChange={onChange} />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.type).toBe("email");
    fireEvent.change(input, { target: { value: "a@b.co" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows an error", () => {
    render(<TextInput label="ZIP" error="Use 5 digits." />);
    const input = screen.getByLabelText("ZIP");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.classList.contains("invalid")).toBe(true);
    expect(screen.getByText("Use 5 digits.")).toBeTruthy();
  });
});
