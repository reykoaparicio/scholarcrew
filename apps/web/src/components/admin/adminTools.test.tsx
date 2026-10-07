// @vitest-environment jsdom
import type { CatalogReport, ImportResult } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollegeImport } from "./CollegeImport";
import { ReportsTable } from "./ReportsTable";
import { ResearchForm } from "./ResearchForm";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const CSV =
  "UNITID,INSTNM,CITY,STABBR,CONTROL,ADM_RATE,COSTT4_A,NPT4_PUB,NPT4_PRIV\n100001,Maple State University,Maple City,TX,1,0.68,24510,12001,NULL";

describe("CollegeImport", () => {
  it("posts the CSV as text/csv and lists the rows that failed", async () => {
    const result: ImportResult = {
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{ line: 3, message: "control: Invalid option" }],
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(result));
    vi.stubGlobal("fetch", fetchMock);
    render(<CollegeImport />);
    expect((screen.getByRole("button", { name: "Import colleges" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("College Scorecard CSV"), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: "Import colleges" }));
    await waitFor(() => expect(screen.getByText("Inserted 1 · Updated 0 · Skipped 1")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/colleges/import");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: CSV,
      headers: { "Content-Type": "text/csv" },
    });
    const table = screen.getByRole("table", { name: "Rows that weren't imported" });
    expect(within(table).getByText("3")).toBeTruthy();
    expect(within(table).getByText("control: Invalid option")).toBeTruthy();
  });

  it("shows the server's message when the upload is refused (14 answers 413)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          { error: { code: "invalid_input", message: "The CSV is over 5 MB. Split it and import each part." } },
          413,
        ),
      ),
    );
    render(<CollegeImport />);
    fireEvent.change(screen.getByLabelText("College Scorecard CSV"), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: "Import colleges" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("The CSV is over 5 MB. Split it and import each part."),
    );
  });

  it("shows the size message for a bare 413 with no error body (R3A-22)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Request Entity Too Large</html>", { status: 413 })),
    );
    render(<CollegeImport />);
    fireEvent.change(screen.getByLabelText("College Scorecard CSV"), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: "Import colleges" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("The CSV is over 5 MB. Split it and import each part."),
    );
  });
});

describe("ResearchForm", () => {
  it("starts research for a state and an optional county", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchForm />);
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "OK" } });
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Research started for OK."));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/research");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ state: "OK" });
    // R3A-24: ResearchInput.county is max 100.
    expect(screen.getByLabelText("County (optional)").getAttribute("maxlength")).toBe("100");
    fireEvent.change(screen.getByLabelText("County (optional)"), { target: { value: " Maple " } });
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Research started for Maple County, OK."),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ state: "OK", county: "Maple" });
  });
});

describe("ReportsTable", () => {
  const report: CatalogReport = {
    id: "77777777-7777-4777-8777-777777777777",
    scholarshipId: "33333333-3333-4333-8333-333333333333",
    scholarshipName: "Hill Country STEM Award",
    reporterId: null,
    reason: "wrong_deadline",
    details: "Site now says Oct 16",
    status: "open",
    createdAt: "2026-10-05T12:00:00.000Z",
    resolvedAt: null,
  };

  it("needs a note, then resolves the report and shows its new status", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...report, status: "resolved" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportsTable reports={[report]} />);
    expect(screen.getByRole("link", { name: "Hill Country STEM Award" }).getAttribute("href")).toBe(
      `/admin/scholarships/${report.scholarshipId}`,
    );
    expect(screen.getByText("Wrong deadline")).toBeTruthy();
    // R3V-10: the reported date is the Central calendar day, with the year.
    expect(screen.getByText("Oct 5, 2026")).toBeTruthy();
    // R3A-24: ResolveReportInput.note is max 1000.
    expect(screen.getByLabelText("Note for report on Hill Country STEM Award").getAttribute("maxlength")).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "Resolve report on Hill Country STEM Award" }));
    expect(screen.getByRole("alert").textContent).toBe("Add a note first.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Note for report on Hill Country STEM Award"), {
      target: { value: "Deadline fixed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve report on Hill Country STEM Award" }));
    await waitFor(() => expect(screen.getByText("Resolved")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/reports/${report.id}/resolve`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      status: "resolved",
      note: "Deadline fixed",
    });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("shows a 409 as already closed: the message, disabled buttons, and a refresh (R3A-21)", async () => {
    const fetchMock = vi.fn(async () =>
      json({ error: { code: "conflict", message: "This report is already closed" } }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportsTable reports={[report]} />);
    fireEvent.change(screen.getByLabelText("Note for report on Hill Country STEM Award"), {
      target: { value: "Deadline fixed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject report on Hill Country STEM Award" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This report is already closed"));
    expect(nav.router.refresh).toHaveBeenCalledTimes(1);
    for (const name of ["Resolve report on Hill Country STEM Award", "Reject report on Hill Country STEM Award"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
