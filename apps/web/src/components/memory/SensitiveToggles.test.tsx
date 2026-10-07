// @vitest-environment jsdom
import type { SensitiveFactSummary } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SensitiveToggles } from "./SensitiveToggles";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const summary = (o: Partial<SensitiveFactSummary> & Pick<SensitiveFactSummary, "kind">): SensitiveFactSummary => ({
  enabled: false,
  hasValue: false,
  displayValue: null,
  sharedByParent: false,
  ...o,
});

function stubEcho() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      kind: SensitiveFactSummary["kind"];
      enabled: boolean;
      value: unknown;
    };
    return new Response(
      JSON.stringify(
        summary({
          kind: body.kind,
          enabled: body.enabled,
          hasValue: body.value !== null,
          displayValue: body.value === "48_75k" ? "$48k–75k" : null,
        }),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SensitiveToggles (ME-05)", () => {
  it("shows a parent-shared income range as an opt-in offer", () => {
    render(
      <SensitiveToggles
        facts={[
          summary({
            kind: "income_range",
            enabled: false,
            hasValue: true,
            displayValue: "$48k–75k",
            sharedByParent: true,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Your parent shared an income range. Turn it on to use it for matching.")).toBeTruthy();
  });

  it("lists all eight kinds off by default with the matcher-only note", () => {
    render(<SensitiveToggles facts={[]} />);
    expect(screen.getAllByRole("switch")).toHaveLength(8);
    for (const s of screen.getAllByRole("switch")) expect(s.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/never in AI prompts/)).toBeTruthy();
    expect(screen.getByText(/matches based on these details are visible only to you/)).toBeTruthy();
  });

  it("turns a yes/no kind on with PUT /sensitive-facts", async () => {
    const fetchMock = stubEcho();
    render(<SensitiveToggles facts={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "First in my family to go to college" }));
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "First in my family to go to college" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/sensitive-facts");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ kind: "first_gen", enabled: true, value: null }),
    });
  });

  it("asks for a range before turning income on", async () => {
    const fetchMock = stubEcho();
    render(<SensitiveToggles facts={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "Household income range" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Income range"), { target: { value: "48_75k" } });
    expect(await screen.findByText("$48k–75k")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ kind: "income_range", enabled: true, value: "48_75k" }),
    );
  });

  it("shows ranges a parent shared and turns them off", async () => {
    const fetchMock = stubEcho();
    render(
      <SensitiveToggles
        facts={[
          summary({
            kind: "income_range",
            enabled: true,
            hasValue: true,
            displayValue: "$48k–75k",
            sharedByParent: true,
          }),
        ]}
      />,
    );
    expect(screen.getByText("$48k–75k · shared by family")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Household income range" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ kind: "income_range", enabled: false, value: null }),
    );
  });

  it("reverts when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "invalid_input", message: "Try again" } }), { status: 400 }),
      ),
    );
    render(<SensitiveToggles facts={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "Military family" }));
    expect(await screen.findByText("Try again")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Military family" }).getAttribute("aria-checked")).toBe("false");
  });
});
