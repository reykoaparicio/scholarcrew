// @vitest-environment jsdom
import type { MeResponse } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "./OnboardingWizard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/onboarding" }));

const NOW = "2026-10-06T15:00:00.000Z";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** What 13 M8 returns from POST /onboarding: a full MeResponse (R3A-18). */
const ME: MeResponse = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "maya.r@example.test",
    displayName: "Maya",
    role: "student",
    birthYear: 2009,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile: {
    userId: "11111111-1111-4111-8111-111111111111",
    classYear: 2027,
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    city: "",
    gpaUnweighted: null,
    gpaWeighted: null,
    intendedMajors: [],
    interests: [],
    onboardingCompletedAt: NOW,
    updatedAt: NOW,
  },
  onboardingComplete: true,
  family: null,
  plan: "free",
};

const UNDERAGE = {
  error: { code: "forbidden", message: "ScholarCrew is for students 13 and older", details: { reason: "underage" } },
};

function stubApi(o: { under13?: boolean; onboarding?: () => Response } = {}) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith("/api/v1/colleges")) {
      return json({
        items: [
          {
            id: "100001",
            name: "State U",
            state: "TX",
            city: "Austin",
            control: "public",
            admitRate: 0.45,
            costOfAttendanceUsd: 27800,
            testPolicy: "optional",
          },
        ],
        page: 1,
        pageSize: 8,
        total: 1,
      });
    }
    if (url === "/api/v1/onboarding") {
      if (o.onboarding) return o.onboarding();
      return o.under13 ? json(UNDERAGE, 403) : json(ME);
    }
    if (url === "/api/v1/documents") {
      return json(
        {
          id: "55555555-5555-4555-8555-555555555555",
          kind: "essay",
          filename: "old-essay.txt",
          mime: "text/plain",
          sizeBytes: 12,
          parseStatus: "none",
          uploadedAt: NOW,
        },
        201,
      );
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillAbout(birthYear = "2009") {
  type("What should we call you?", "Maya");
  type("Birth year", birthYear);
  type("High school graduation year", "2027");
  type("High school", "Maple High School");
  type("State", "TX");
  type("County", "Maple");
}

/** Steps 2 to 5 with nothing added, then Finish setup. */
function finishWithDefaults() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingWizard", () => {
  it("validates step 1 before moving on", () => {
    stubApi();
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    expect(screen.getByText("Step 1 of 5 · About you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Tell us what to call you")).toBeTruthy();
    expect(screen.getByText("Pick your state")).toBeTruthy();
    expect(screen.getByText("Step 1 of 5 · About you")).toBeTruthy();
  });

  it("checks the age right away and shows the plain explanation when under 13 (ID-03)", async () => {
    const fetchMock = stubApi({ under13: true });
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout("2015");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "ScholarCrew is for students 13 and older" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/onboarding");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      birthYear: 2015,
      sensitive: [],
      collegeIds: [],
    });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(window.localStorage.getItem("sc:onboarding")).toBeNull();
  });

  it("explains that past essays go into a Quill story interview and uploads files (ON-02, D9)", async () => {
    const fetchMock = stubApi();
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    expect(screen.getByText(/paste it into a Quill story interview/)).toBeTruthy();
    type("What is it?", "essay");
    const file = new File(["my old essay"], "old-essay.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
    expect(await screen.findByText("old-essay.txt")).toBeTruthy();
    const upload = fetchMock.mock.calls.find(([url]) => url === "/api/v1/documents");
    const form = upload?.[1]?.body as FormData;
    expect(form.get("kind")).toBe("essay");
    expect((form.get("file") as File).name).toBe("old-essay.txt");
  });

  it("rejects files that are too big or the wrong type before uploading", async () => {
    const fetchMock = stubApi();
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    const zip = new File(["x"], "essays.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [zip] } });
    expect(await screen.findByText("Upload a PDF, text file, PNG, or JPEG.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/v1/documents")).toBe(false);
  });

  it("finishes with opt-ins, colleges, and a parent invite", async () => {
    const fetchMock = stubApi();
    render(<OnboardingWizard initialName="Maya R." initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    type("Unweighted GPA (optional)", "3.72");
    fireEvent.click(screen.getByRole("button", { name: "Continue to opt-ins" }));
    expect(screen.getByText("Never sent to AI.")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "First in my family to go to college" }));
    fireEvent.click(screen.getByRole("switch", { name: "Household income range" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    expect(screen.getByText("Pick a range or turn this off")).toBeTruthy();
    type("Income range", "48_75k");
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to colleges" }));
    type("Search colleges", "State");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add State U" }));
    expect(screen.getByRole("button", { name: "Remove State U" })).toBeTruthy();
    type("Parent or guardian email (optional)", "dana@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/week"));

    const onboarding = fetchMock.mock.calls.find(([url]) => url === "/api/v1/onboarding");
    expect(JSON.parse(String(onboarding?.[1]?.body))).toMatchObject({
      displayName: "Maya",
      gpaUnweighted: 3.72,
      collegeIds: ["100001"],
      sensitive: [
        { kind: "first_gen", enabled: true, value: null },
        { kind: "income_range", enabled: true, value: "48_75k" },
      ],
    });
    const invite = fetchMock.mock.calls.find(([url]) => url === "/api/v1/family/invites");
    expect(JSON.parse(String(invite?.[1]?.body))).toEqual({ email: "dana@example.test" });
    expect(fetchMock.mock.calls.find(([url]) => url.startsWith("/api/v1/colleges"))?.[0]).toBe(
      "/api/v1/colleges?q=State&pageSize=8",
    );
  });

  it("keeps the draft on this device without sensitive answers", () => {
    stubApi();
    const { unmount } = render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    unmount();
    const saved = window.localStorage.getItem("sc:onboarding") ?? "";
    expect(saved).toContain("Maple High School");
    expect(saved).not.toContain("sensitive");
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    expect((screen.getByLabelText("High school") as HTMLInputElement).value).toBe("Maple High School");
  });

  it("goes to This week and clears the draft when setup already finished in another tab (409, R3A-17)", async () => {
    stubApi({
      onboarding: () => json({ error: { code: "conflict", message: "Onboarding is already complete" } }, 409),
    });
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    finishWithDefaults();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/week"));
    expect(router.refresh).toHaveBeenCalled();
    expect(window.localStorage.getItem("sc:onboarding")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the draft and shows the message on a 403 that isn't the age block (CSRF, R3A-17)", async () => {
    stubApi({
      onboarding: () =>
        json({ error: { code: "forbidden", message: "This request didn't come from ScholarCrew" } }, 403),
    });
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    finishWithDefaults();
    expect((await screen.findByRole("alert")).textContent).toBe("This request didn't come from ScholarCrew");
    expect(screen.queryByRole("heading", { name: "ScholarCrew is for students 13 and older" })).toBeNull();
    expect(window.localStorage.getItem("sc:onboarding") ?? "").toContain("Maple High School");
    expect(router.push).not.toHaveBeenCalled();
  });
});
