// @vitest-environment jsdom
import type { CrewJob } from "@scholarcrew/domain";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STILL_WORKING, STREAM_LOST, useJobStream } from "./sse";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  /** 0 CONNECTING (the browser retries), 2 CLOSED (it gave up). */
  readyState = 0;
  listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data = "{}") {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  close() {
    this.closed = true;
  }
}

const job = (o: Partial<CrewJob> = {}): CrewJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "crew_request",
  status: "working",
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: null,
  progress: [{ at: "2026-10-06T15:00:01.000Z", role: "scout", text: "Checking local listings" }],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:01.000Z",
  ...o,
});

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(cleanup);

const JOB_URL = `/api/v1/jobs/${job().id}`;

/** fetch that answers GET /jobs/:id with each job in turn (the last one repeats). */
function pollReturning(...jobs: CrewJob[]) {
  let n = 0;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = jobs[Math.min(n, jobs.length - 1)];
    n += 1;
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("useJobStream", () => {
  it("does nothing without a job id", () => {
    const { result } = renderHook(() => useJobStream(null));
    expect(result.current).toEqual({ job: null, error: null });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("follows job events and closes on a terminal job without polling", () => {
    const fetchMock = pollReturning(job({ status: "ready" }));
    const { result, unmount } = renderHook(() => useJobStream(job().id));
    const source = FakeEventSource.instances[0];
    expect(source?.url).toBe(`/api/v1/jobs/${job().id}/events`);
    act(() => source?.emit("job", JSON.stringify(job())));
    expect(result.current.job?.status).toBe("working");
    expect(result.current.job?.progress[0]?.text).toBe("Checking local listings");
    act(() => source?.emit("job", JSON.stringify(job({ status: "ready" }))));
    expect(result.current.job?.status).toBe("ready");
    expect(source?.closed).toBe(true);
    act(() => source?.emit("end"));
    act(() => source?.emit("error"));
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });

  it("ignores malformed events", () => {
    const { result } = renderHook(() => useJobStream(job().id));
    act(() => FakeEventSource.instances[0]?.emit("job", "not json"));
    expect(result.current).toEqual({ job: null, error: null });
  });

  it("an error falls back to polling GET /jobs/:id until a terminal status", async () => {
    const fetchMock = pollReturning(job({ status: "ready" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    const source = FakeEventSource.instances[0];
    act(() => source?.emit("job", JSON.stringify(job())));
    act(() => source?.emit("error"));
    expect(source?.closed).toBe(true);
    await waitFor(() => expect(result.current.job?.status).toBe("ready"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(JOB_URL);
    expect(result.current.error).toBeNull();
    await pause(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("end before a terminal status polls until the job finishes", async () => {
    const fetchMock = pollReturning(job({ status: "working" }), job({ status: "ready" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    const source = FakeEventSource.instances[0];
    act(() => source?.emit("job", JSON.stringify(job())));
    act(() => source?.emit("end"));
    expect(source?.closed).toBe(true);
    await waitFor(() => expect(result.current.job?.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("reports a lost connection when polling keeps failing or the job is gone", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", offline);
    const first = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    act(() => FakeEventSource.instances[0]?.emit("error"));
    await waitFor(() => expect(first.result.current.error).toBe(STREAM_LOST));
    expect(offline).toHaveBeenCalledTimes(3);
    first.unmount();

    const gone = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "not_found", message: "Job not found" } }), { status: 404 }),
    );
    vi.stubGlobal("fetch", gone);
    const second = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    act(() => FakeEventSource.instances[1]?.emit("error"));
    await waitFor(() => expect(second.result.current.error).toBe(STREAM_LOST));
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("stops with a still-working message after maxMs", async () => {
    pollReturning(job({ status: "working" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5, maxMs: 40 }));
    act(() => FakeEventSource.instances[0]?.emit("end"));
    await waitFor(() => expect(result.current.error).toBe(STILL_WORKING));
    expect(result.current.job?.status).toBe("working");
  });

  it("reports a fatal error (stream CLOSED) at once without polling", () => {
    const fetchMock = pollReturning(job({ status: "ready" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    const source = FakeEventSource.instances[0];
    if (source) source.readyState = 2;
    act(() => source?.emit("error"));
    expect(result.current.error).toBe(STREAM_LOST);
    expect(source?.closed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the old stream when the id changes", () => {
    const { rerender } = renderHook(({ id }) => useJobStream(id), { initialProps: { id: "a" as string | null } });
    rerender({ id: "b" });
    expect(FakeEventSource.instances.map((s) => s.closed)).toEqual([true, false]);
    rerender({ id: null });
    expect(FakeEventSource.instances[1]?.closed).toBe(true);
  });
});
