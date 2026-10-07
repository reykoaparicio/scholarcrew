// @vitest-environment jsdom
import {
  type CatalogTask,
  type ListingDraft,
  type Scholarship,
  ScholarshipUpsertInput,
  type VerificationReport,
} from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskReview } from "./TaskReview";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DRAFT: ListingDraft = {
  name: "Pecan Valley Co-op Scholarship",
  provider: "Pecan Valley Electric Cooperative",
  url: "https://pecanvalley.example/scholarships",
  amountMinUsd: null,
  amountMaxUsd: 1500,
  renewable: null,
  deadline: "2027-03-01",
  applicationFeeUsd: 0,
  localArea: { national: false, state: "TX", counties: ["Maple", "Pecan"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple", "Pecan"] }],
  requirements: {
    essays: [{ prompt: "Energy in your community", wordLimit: 300 }],
    recommendations: 0,
    transcript: false,
    serviceHours: null,
    other: [],
  },
  fieldQuotes: [
    { field: "amountMaxUsd", quote: "awards four $1,500 scholarships each spring" },
    { field: "requirements", quote: "a 300-word essay on energy in your community" },
  ],
};
const REPORT: VerificationReport = {
  ok: false,
  issues: [
    { code: "quote_not_found", field: "requirements", message: 'Quote not found on the page: "a 300-word essay"' },
    { code: "scam_signal", field: null, message: "A linked search service charges a fee." },
  ],
  scamFlags: ["pay_for_info"],
};
const TASK: CatalogTask = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "research_candidate",
  status: "open",
  scholarshipId: null,
  payload: {
    type: "research_candidate",
    url: "https://pecanvalley.example/scholarships",
    title: "Scholarships | Pecan Valley",
    snippet: "Four awards each spring",
    state: "TX",
    county: "Maple",
    draft: DRAFT,
    report: REPORT,
  },
  createdById: null,
  resolvedById: null,
  resolutionNote: "",
  // 9 pm Central on Oct 6 (Oct 7 in UTC), so "Opened" proves the admin calendar (R3V-10).
  createdAt: "2026-10-07T02:00:00.000Z",
  resolvedAt: null,
};
const CREATED = { id: "55555555-5555-4555-8555-555555555555", name: "Pecan Valley Co-op Scholarship" } as Scholarship;

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

describe("TaskReview", () => {
  it("shows extracted fields beside their quotes, the quote-not-found issue, and scam flags", () => {
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    const table = screen.getByRole("table", { name: "Extracted fields" });
    const reqRow = within(table).getByText("Requirements").closest("tr");
    if (!reqRow) throw new Error("requirements row missing");
    expect(within(reqRow).getByText("Not on page")).toBeTruthy();
    const amountRow = within(table).getByText("Maximum amount").closest("tr");
    if (!amountRow) throw new Error("amount row missing");
    expect(within(amountRow).getByText("Found")).toBeTruthy();
    const checks = screen.getByRole("region", { name: "Checks run by code" });
    expect(within(checks).getByText('Quote not found on the page: "a 300-word essay"')).toBeTruthy();
    expect(within(checks).getByText("A linked search service charges a fee.")).toBeTruthy();
    expect(within(checks).getByText("Sells scholarship information you can get free.")).toBeTruthy();
    expect(screen.getByText(/^Opened Oct 6, 2026/)).toBeTruthy();
    // R3A-24: CatalogTaskResolution.note is max 1000.
    expect(screen.getByLabelText("Decision note").getAttribute("maxlength")).toBe("1000");
  });

  it("shows a 409 as already closed: the message, no live buttons, and a refresh (R3A-21)", async () => {
    const { fn, calls } = recorder(() =>
      json({ error: { code: "conflict", message: "This task is already closed" } }, 409),
    );
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Last year's cycle" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This task is already closed"));
    expect(nav.router.refresh).toHaveBeenCalledTimes(1);
    for (const name of ["Publish", "Reject"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(calls).toHaveLength(1);
  });

  it("publishes by creating the listing, then resolving the task with its id, and retries without a duplicate", async () => {
    let resolveFails = true;
    const { fn, calls } = recorder((c) => {
      if (c.url.endsWith("/resolve")) {
        if (resolveFails) {
          resolveFails = false;
          return json({ error: { code: "internal", message: "Try again" } }, 500);
        }
        return json({ ...TASK, status: "resolved" });
      }
      return json(CREATED, c.method === "POST" ? 201 : 200);
    });
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Checked the page" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Try again"));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published Pecan Valley Co-op Scholarship.")).toBeTruthy());

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/v1/admin/scholarships",
      `POST /api/v1/admin/catalog-tasks/${TASK.id}/resolve`,
      `PATCH /api/v1/admin/scholarships/${CREATED.id}`,
      `POST /api/v1/admin/catalog-tasks/${TASK.id}/resolve`,
    ]);
    expect(ScholarshipUpsertInput.safeParse(calls[0]?.body).success).toBe(true);
    expect(calls[0]?.body).toMatchObject({ slug: "pecan-valley-co-op-scholarship", scamFlags: ["pay_for_info"] });
    expect(calls[3]?.body).toEqual({ status: "resolved", note: "Checked the page", publishScholarshipId: CREATED.id });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("needs a reason to reject, then rejects without publishing", async () => {
    const { fn, calls } = recorder(() => json({ ...TASK, status: "rejected" }));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={TASK} existing={null} defaultCycle="2026-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert").textContent).toContain("Add a reason before rejecting.");
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Last year's cycle" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByText("Rejected.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/catalog-tasks/${TASK.id}/resolve`,
        method: "POST",
        body: { status: "rejected", note: "Last year's cycle", publishScholarshipId: null },
      },
    ]);
  });

  it("updates the existing listing for a changed re-check and shows what changed", async () => {
    const existing = {
      ...CREATED,
      slug: "pecan-valley",
      sourceUrl: "https://pecanvalley.example/scholarships",
      cycle: "2026-27",
      estMinutes: 45,
      renewalTerms: "",
      scamFlags: [],
    } as Scholarship;
    const recheck: CatalogTask = {
      ...TASK,
      kind: "recheck_changed",
      scholarshipId: existing.id,
      payload: {
        type: "recheck_changed",
        url: "https://pecanvalley.example/scholarships",
        before: DRAFT,
        after: { ...DRAFT, deadline: "2027-03-15" },
        report: null,
      },
    };
    const { fn, calls } = recorder((c) =>
      c.url.endsWith("/resolve") ? json({ ...recheck, status: "resolved" }) : json(existing),
    );
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={recheck} existing={existing} defaultCycle="2026-27" />);
    const deadlineRow = screen.getByText("Deadline").closest("tr");
    if (!deadlineRow) throw new Error("deadline row missing");
    expect(within(deadlineRow).getByText("Mar 1, 2027")).toBeTruthy();
    expect(within(deadlineRow).getByText("Mar 15, 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toMatchObject({ method: "PATCH", url: `/api/v1/admin/scholarships/${existing.id}` });
    expect(calls[0]?.body).toMatchObject({ id: existing.id, slug: "pecan-valley", deadline: "2027-03-15" });
  });

  it("resolves a report through the report endpoint", async () => {
    const reportId = "66666666-6666-4666-8666-666666666666";
    const report: CatalogTask = {
      ...TASK,
      kind: "report",
      scholarshipId: CREATED.id,
      payload: { type: "report", reportId, reason: "wrong_deadline", details: "Site now says Oct 16" },
    };
    const { fn, calls } = recorder(() => json({ id: reportId, status: "resolved" }));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={report} existing={null} defaultCycle="2026-27" />);
    expect(screen.getByText("Site now says Oct 16")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the listing" }).getAttribute("href")).toBe(
      `/admin/scholarships/${CREATED.id}`,
    );
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Deadline fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve report" }));
    await waitFor(() => expect(screen.getByText("Report resolved.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/reports/${reportId}/resolve`,
        method: "POST",
        body: { status: "resolved", note: "Deadline fixed" },
      },
    ]);
  });

  const SUBMITTER = "77777777-7777-4777-8777-777777777777";

  it("shows a submission's extracted fields and checks, and Publish PATCHes the submitted listing before resolving (R2C-6)", async () => {
    const placeholder = {
      ...CREATED,
      slug: "garden-club-award-k3f9",
      sourceUrl: "https://pecanvalley.example/scholarships",
      cycle: "2026-27",
      estMinutes: 60,
      renewalTerms: "",
      scamFlags: [],
    } as Scholarship;
    const submission: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      scholarshipId: placeholder.id,
      payload: {
        type: "user_submission",
        url: "https://pecanvalley.example/scholarships",
        name: "Garden Club Award",
        notes: "From the counselor's flyer",
        submittedById: SUBMITTER,
        draft: DRAFT,
        report: REPORT,
      },
    };
    const { fn, calls } = recorder((c) =>
      c.url.endsWith("/resolve") ? json({ ...submission, status: "resolved" }) : json(placeholder),
    );
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={submission} existing={placeholder} defaultCycle="2026-27" />);
    const table = screen.getByRole("table", { name: "Extracted fields" });
    const amountRow = within(table).getByText("Maximum amount").closest("tr");
    if (!amountRow) throw new Error("amount row missing");
    expect(within(amountRow).getByText("$1,500")).toBeTruthy();
    const checks = screen.getByRole("region", { name: "Checks run by code" });
    expect(within(checks).getByText("Sells scholarship information you can get free.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published Pecan Valley Co-op Scholarship.")).toBeTruthy());
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PATCH /api/v1/admin/scholarships/${placeholder.id}`,
      `POST /api/v1/admin/catalog-tasks/${submission.id}/resolve`,
    ]);
    expect(ScholarshipUpsertInput.safeParse(calls[0]?.body).success).toBe(true);
    expect(calls[0]?.body).toMatchObject({
      id: placeholder.id,
      slug: "garden-club-award-k3f9",
      provider: "Pecan Valley Electric Cooperative",
      amountMaxUsd: 1500,
      scamFlags: ["pay_for_info"],
    });
    expect(calls[1]?.body).toEqual({ status: "resolved", note: "", publishScholarshipId: placeholder.id });
  });

  it("offers plain Publish for a submission the extractor hasn't read", async () => {
    const submission: CatalogTask = {
      ...TASK,
      kind: "user_submission",
      scholarshipId: CREATED.id,
      payload: {
        type: "user_submission",
        url: "https://x.example",
        name: "Garden Club Award",
        notes: "",
        submittedById: SUBMITTER,
      },
    };
    const { fn, calls } = recorder(() => json({ ...submission, status: "resolved" }));
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={submission} existing={null} defaultCycle="2026-27" />);
    expect(screen.queryByRole("table", { name: "Extracted fields" })).toBeNull();
    expect(screen.getByText(/The page hasn't been read yet/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published Garden Club Award.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/catalog-tasks/${submission.id}/resolve`,
        method: "POST",
        body: { status: "resolved", note: "", publishScholarshipId: CREATED.id },
      },
    ]);
  });

  it("keeps or retires a re-checked listing instead of rejecting it (R2C-7)", async () => {
    const recheck: CatalogTask = {
      ...TASK,
      kind: "recheck_changed",
      scholarshipId: CREATED.id,
      payload: {
        type: "recheck_changed",
        url: "https://pecanvalley.example/scholarships",
        before: DRAFT,
        after: { ...DRAFT, deadline: "2027-03-15" },
        report: null,
      },
    };
    const { fn, calls } = recorder((c) =>
      c.url.endsWith("/resolve") ? json({ ...recheck, status: "resolved" }) : json({ ...CREATED, status: "retired" }),
    );
    vi.stubGlobal("fetch", fn);
    render(<TaskReview task={recheck} existing={null} defaultCycle="2026-27" />);
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep current listing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retire listing" }));
    expect(screen.getByRole("alert").textContent).toContain("Add a reason before retiring the listing.");
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "The program ended" } });
    fireEvent.click(screen.getByRole("button", { name: "Retire listing" }));
    await waitFor(() => expect(screen.getByText("Listing retired.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/scholarships/${CREATED.id}/status`,
        method: "POST",
        body: { status: "retired", note: "The program ended" },
      },
      {
        url: `/api/v1/admin/catalog-tasks/${recheck.id}/resolve`,
        method: "POST",
        body: { status: "resolved", note: "The program ended", publishScholarshipId: null },
      },
    ]);

    // Keeping the listing is one call: core puts a stale listing back to published (08 H11).
    cleanup();
    calls.length = 0;
    render(<TaskReview task={recheck} existing={null} defaultCycle="2026-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Keep current listing" }));
    await waitFor(() => expect(screen.getByText("Kept the current listing.")).toBeTruthy());
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/catalog-tasks/${recheck.id}/resolve`,
        method: "POST",
        body: { status: "rejected", note: "", publishScholarshipId: null },
      },
    ]);
  });
});
