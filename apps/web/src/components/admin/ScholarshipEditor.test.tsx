// @vitest-environment jsdom
import { type Scholarship, ScholarshipUpsertInput } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScholarshipEditor } from "./ScholarshipEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LISTING: Scholarship = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "maple-rotary-stem-award",
  name: "Maple Rotary STEM Award",
  provider: "Maple Rotary Club",
  url: "https://maplerotary.example/stem",
  sourceUrl: "https://maplerotary.example/stem",
  amountMinUsd: 1000,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2027-02-01",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [],
  requirements: { essays: [], recommendations: 0, transcript: false, serviceHours: null, other: [] },
  status: "draft",
  visibility: "public",
  submittedById: null,
  scamFlags: [],
  estMinutes: 90,
  verifiedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ScholarshipEditor", () => {
  it("creates a new listing with a generated slug and opens it", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(LISTING, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScholarshipEditor listing={null} defaultCycle="2026-27" />);
    type("Name", "Maple Rotary STEM Award");
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("maple-rotary-stem-award");
    type("Provider", "Maple Rotary Club");
    type("Apply URL", "https://maplerotary.example/stem");
    type("Minimum amount ($)", "1,000");
    type("Maximum amount ($)", "$2,500");
    type("Deadline", "2027-02-01");
    type("Counties", "Maple");
    fireEvent.click(screen.getByRole("button", { name: "Add essay" }));
    type("Essay prompt", "Why STEM?");
    type("Word limit", "500");
    fireEvent.click(screen.getByRole("checkbox", { name: /Charges a fee to apply/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create listing" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith(`/admin/scholarships/${LISTING.id}`));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/scholarships");
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(ScholarshipUpsertInput.safeParse(sent).success).toBe(true);
    expect(sent).toMatchObject({
      id: null,
      slug: "maple-rotary-stem-award",
      amountMinUsd: 1000,
      amountMaxUsd: 2500,
      sourceUrl: "https://maplerotary.example/stem",
      cycle: "2026-27",
      estMinutes: 60,
      localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
      requirements: { essays: [{ prompt: "Why STEM?", wordLimit: 500 }] },
      scamFlags: ["application_fee"],
    });
  });

  it("shows field errors and sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ScholarshipEditor listing={LISTING} defaultCycle="2026-27" />);
    type("Minimum amount ($)", "5000");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toContain("Minimum amount: Minimum is above maximum.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves edits with PATCH and publishes with a note", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/status")
        ? json({ ...LISTING, status: "published", verifiedAt: "2026-10-06T15:00:00.000Z" })
        : json({ ...LISTING, name: "Maple STEM Award" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScholarshipEditor listing={LISTING} defaultCycle="2026-27" />);
    type("Name", "Maple STEM Award");
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("maple-rotary-stem-award");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/scholarships/${LISTING.id}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });

    type("Note for the audit log", "Checked the club page");
    // R3A-24: the note's client limit matches ScholarshipStatusInput.note (max 1000).
    expect(screen.getByLabelText("Note for the audit log").getAttribute("maxlength")).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByText("Published. The verified date is today.")).toBeTruthy());
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/admin/scholarships/${LISTING.id}/status`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      status: "published",
      note: "Checked the club page",
    });
    // R3V-10: the status badge is labeled, and the verified date is the Central calendar day.
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText(/Verified Oct 6, 2026\./)).toBeTruthy();
    expect(nav.router.refresh).toHaveBeenCalled();
  });
});
