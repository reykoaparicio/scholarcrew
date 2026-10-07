// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailActions, StartEssayButton } from "./DetailActions";
import { ReportModal } from "./ReportModal";
import { amountLabel, areaLabel, ruleText, sourceBadges } from "./detail";
import { application } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/scholarships/rotary" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const ID = "44444444-4444-4444-8444-444444444444";

describe("detail helpers", () => {
  it("describes listing rules in plain words", () => {
    expect(ruleText({ type: "county_in", state: "TX", counties: ["Maple"] })).toBe("Lives in Maple County, TX");
    expect(ruleText({ type: "class_year_in", years: [2027] })).toBe("Class of 2027");
    expect(ruleText({ type: "gpa_min", min: 3 })).toBe("GPA of 3.0 or higher");
    expect(ruleText({ type: "test_min", test: "ACT", min: 24 })).toBe("ACT of 24 or higher");
    expect(ruleText({ type: "first_gen" })).toBe("First in your family to go to college");
    expect(ruleText({ type: "custom", text: "Not related to a club member" })).toBe("Not related to a club member");
  });

  it("labels the area, amount, and source state", () => {
    expect(areaLabel({ national: false, state: "TX", counties: ["Maple"], cities: [] })).toBe(
      "Local · Maple County, TX",
    );
    expect(areaLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(amountLabel(500, 2500)).toBe("$500–$2,500");
    expect(amountLabel(2500, 2500)).toBe("$2,500");
    const base = { verifiedAt: "2026-10-02T15:00:00.000Z", stale: false, scamFlags: [], status: "published" as const };
    expect(sourceBadges(base, "America/Chicago")).toEqual([{ tone: "good", label: "Verified Oct 2" }]);
    expect(sourceBadges({ ...base, stale: true, scamFlags: ["application_fee"] }, "America/Chicago")).toEqual([
      { tone: "warn", label: "Stale · re-checking" },
      { tone: "crit", label: "Flagged" },
    ]);
    expect(sourceBadges({ ...base, verifiedAt: null, status: "draft" }, "America/Chicago")).toEqual([
      { tone: "neutral", label: "Unverified" },
    ]);
  });
});

describe("ReportModal", () => {
  it("needs a reason, then sends the report", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportModal scholarshipId={ID} open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Report a problem" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Pick what's wrong.");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "What's wrong?" }), {
      target: { value: "wrong_deadline" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Details (optional)" }), {
      target: { value: "It says Nov 1 now" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(within(dialog).getByText("Thanks. An admin will check this listing.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/scholarships/${ID}/report`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reason: "wrong_deadline",
      details: "It says Nov 1 now",
    });
  });
});

describe("detail actions", () => {
  it("saves an unsaved listing and marks a draft submitted", async () => {
    // 14 answers the POST with 201 and the PATCH with 200 (R3A-20).
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({}, init?.method === "POST" ? 201 : 200));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<DetailActions scholarshipId={ID} application={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to my board" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ scholarshipId: ID });
    const app = application({ stage: "drafting" });
    rerender(<DetailActions scholarshipId={ID} application={app} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark submitted" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/scholarship-applications/${app.id}`);
  });

  it("starts an essay for a prompt and moves the card to drafting", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === "/api/v1/essays" ? json({ id: "e1" }, 201) : json({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = application({ stage: "planned" });
    render(
      <StartEssayButton
        scholarshipId={ID}
        title="Rotary Club of Eastside essay"
        prompt="Describe a time you used your skills to serve your community."
        wordLimit={500}
        application={app}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start essay" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/essays/e1"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Rotary Club of Eastside essay",
      prompt: "Describe a time you used your skills to serve your community.",
      wordLimit: 500,
      targetType: "scholarship",
      targetScholarshipId: ID,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ stage: "drafting" });
  });

  it("cuts a long generated title to EssayInput's 200 characters (R3V-15, R3A-19)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === "/api/v1/essays" ? json({ id: "e2" }, 201) : json({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const name = "N".repeat(200);
    render(
      <StartEssayButton
        scholarshipId={ID}
        title={`${name} essay 2`}
        prompt="Tell us about a goal."
        wordLimit={null}
        application={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start essay" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/essays/e2"));
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { title: string };
    expect(sent.title).toHaveLength(200);
    expect(sent.title.startsWith(name)).toBe(true);
  });
});
