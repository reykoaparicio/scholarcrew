// @vitest-environment jsdom
import type { CrewJob } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundJobs } from "./BackgroundJobs";
import { rememberJob } from "./jobMemory";

afterEach(cleanup);
beforeEach(() => window.sessionStorage.clear());

const job: CrewJob = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "crew_request",
  status: "working",
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: null,
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
};

describe("BackgroundJobs", () => {
  it("lists active jobs from GET /jobs?active=1, the last sweep, and the deadline watcher (D28)", async () => {
    rememberJob(job, "Plan my weekend");
    const plan: CrewJob = { ...job, id: "33333333-3333-4333-8333-333333333333", kind: "weekly_plan", status: "queued" };
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify([job, plan]), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BackgroundJobs
        sweep={{ ranAt: "2026-10-04T19:00:00.000Z", newMatches: 3, totalUsd: 7500, reuseCount: 2, hiddenScams: 1 }}
        timeZone="America/Chicago"
      />,
    );
    expect(await screen.findByText("“Plan my weekend”")).toBeTruthy();
    expect(screen.getByText("Planning your week")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/jobs?active=1&limit=10");
    expect(screen.getByText(/found 3 new matches · Oct 4/)).toBeTruthy();
    expect(screen.getByText(/reminders 7, 3, and 1 day before/)).toBeTruthy();
  });

  it("shows only the standing rows when nothing is running, and the error when the list fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "internal", message: "Try again soon" } }), { status: 500 }),
      ),
    );
    render(<BackgroundJobs sweep={null} timeZone="America/Chicago" />);
    expect(await screen.findByText("Try again soon")).toBeTruthy();
    expect(screen.getByText(/runs every Sunday/)).toBeTruthy();
    expect(screen.queryByText("Your crew")).toBeNull();
  });
});
