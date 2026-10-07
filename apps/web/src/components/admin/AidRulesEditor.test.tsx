// @vitest-environment jsdom
import { type AidDeadline, AidDeadlineInput, type AidRule, AidRuleInput } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AidRulesEditor } from "./AidRulesEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

type Call = { url: string; method: string; body: unknown };
function recorder(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return handler(call);
  });
  return { fn, calls };
}

const YEAR = "2027-28";
const RATES_URL = "https://studentaid.gov/understand-aid/types/loans/interest-rates";
const FAFSA_URL = "https://studentaid.gov/apply-for-aid/fafsa/fafsa-deadlines";
const FAFSA: AidDeadline = {
  id: "88888888-8888-4888-8888-888888888888",
  awardYear: YEAR,
  state: null,
  program: "FAFSA",
  deadline: "2028-06-30",
  note: "",
  sourceUrl: FAFSA_URL,
  verifiedAt: "2026-10-01T00:00:00.000Z",
};

describe("AidRulesEditor (R2P-1)", () => {
  it("checks the loan rates, then saves them with PUT /admin/aid-rules", async () => {
    const saved: AidRule = {
      id: "99999999-9999-4999-8999-999999999999",
      awardYear: YEAR,
      key: "federal_loan_rates",
      value: { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 },
      sourceUrl: RATES_URL,
      verifiedAt: "2026-10-06T15:00:00.000Z",
    };
    const { fn, calls } = recorder(() => json(saved));
    vi.stubGlobal("fetch", fn);
    render(<AidRulesEditor awardYear={YEAR} rule={null} deadlines={[]} />);
    expect(
      screen.getByText("No rates saved for 2027-28 yet, so award letters show no loan payment estimates."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Subsidized rate (%)"), { target: { value: "6.39" } });
    fireEvent.change(screen.getByLabelText("Unsubsidized rate (%)"), { target: { value: "6.39" } });
    fireEvent.change(screen.getByLabelText("Parent PLUS rate (%)"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Rates source URL"), { target: { value: ` ${RATES_URL} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Save loan rates" }));
    expect(screen.getByRole("alert").textContent).toBe("Parent PLUS rate: use a percentage from 0 to 30.");
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Parent PLUS rate (%)"), { target: { value: "8.94" } });
    fireEvent.click(screen.getByRole("button", { name: "Save loan rates" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Loan rates saved for 2027-28."));
    expect(calls).toEqual([
      {
        url: "/api/v1/admin/aid-rules",
        method: "PUT",
        body: {
          awardYear: YEAR,
          key: "federal_loan_rates",
          value: { subsidized: 6.39, unsubsidized: 6.39, parent_plus: 8.94 },
          sourceUrl: RATES_URL,
        },
      },
    ]);
    expect(AidRuleInput.safeParse(calls[0]?.body).success).toBe(true);
    // R3V-10: the verified instant on the admin (Central) calendar, not the UTC slice.
    expect(screen.getByText("Interest rates for 2027-28 loans. Last checked Oct 6, 2026.")).toBeTruthy();
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("adds a state deadline, then deletes it", async () => {
    const added: AidDeadline = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      awardYear: YEAR,
      state: "TX",
      program: "TEXAS Grant priority",
      deadline: "2027-01-15",
      note: "Check with the school.",
      sourceUrl: FAFSA_URL,
      verifiedAt: "2026-10-06T15:00:00.000Z",
    };
    const { fn, calls } = recorder((c) => (c.method === "DELETE" ? new Response(null, { status: 204 }) : json(added)));
    vi.stubGlobal("fetch", fn);
    render(<AidRulesEditor awardYear={YEAR} rule={null} deadlines={[FAFSA]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add deadline" }));
    expect(screen.getByRole("alert").textContent).toContain("Program: give it a name (up to 80 characters).");
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("State"), { target: { value: "TX" } });
    fireEvent.change(screen.getByLabelText("Program"), { target: { value: " TEXAS Grant priority " } });
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2027-01-15" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Check with the school." } });
    fireEvent.change(screen.getByLabelText("Deadline source URL"), { target: { value: FAFSA_URL } });
    fireEvent.click(screen.getByRole("button", { name: "Add deadline" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Added TEXAS Grant priority."));
    expect(calls[0]).toEqual({
      url: "/api/v1/admin/aid-deadlines",
      method: "PUT",
      body: {
        awardYear: YEAR,
        state: "TX",
        program: "TEXAS Grant priority",
        deadline: "2027-01-15",
        note: "Check with the school.",
        sourceUrl: FAFSA_URL,
      },
    });
    expect(AidDeadlineInput.safeParse(calls[0]?.body).success).toBe(true);
    const table = screen.getByRole("table", { name: "Aid deadlines" });
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("Texas");
    expect(rows[0]).toContain("Jan 15, 2027");
    expect(rows[1]).toContain("Federal");
    expect(rows[1]).toContain("Jun 30, 2028");

    fireEvent.click(screen.getByRole("button", { name: "Delete TEXAS Grant priority (Texas)" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Deleted TEXAS Grant priority."));
    expect(calls[1]).toEqual({ url: `/api/v1/admin/aid-deadlines/${added.id}`, method: "DELETE", body: null });
    expect(within(table).queryByText("TEXAS Grant priority")).toBeNull();
    expect(within(table).getByText("FAFSA")).toBeTruthy();
  });

  it("edits a deadline in place, sending its id", async () => {
    const edited: AidDeadline = { ...FAFSA, deadline: "2028-06-29", verifiedAt: "2026-10-06T15:00:00.000Z" };
    const { fn, calls } = recorder(() => json(edited));
    vi.stubGlobal("fetch", fn);
    render(<AidRulesEditor awardYear={YEAR} rule={null} deadlines={[FAFSA]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit FAFSA (Federal)" }));
    expect((screen.getByLabelText("Program") as HTMLInputElement).value).toBe("FAFSA");
    expect((screen.getByLabelText("State") as HTMLSelectElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2028-06-29" } });
    fireEvent.click(screen.getByRole("button", { name: "Save deadline" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved FAFSA."));
    expect(calls).toEqual([
      {
        url: "/api/v1/admin/aid-deadlines",
        method: "PUT",
        body: {
          id: FAFSA.id,
          awardYear: YEAR,
          state: null,
          program: "FAFSA",
          deadline: "2028-06-29",
          note: "",
          sourceUrl: FAFSA_URL,
        },
      },
    ]);
    const table = screen.getByRole("table", { name: "Aid deadlines" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("Jun 29, 2028")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add deadline" })).toBeTruthy();
  });
});
