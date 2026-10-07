import { TEST_NOW } from "@scholarcrew/core/shared";
import { crewJobs, eq } from "@scholarcrew/db";
import type { CrewJob } from "@scholarcrew/domain";
import { params, request, signedInStudent, useTestDeps } from "@test/helpers";
import { afterEach, describe, expect, it } from "vitest";
import { GET as events } from "./route";
import { setJobEventTimingForTests } from "./stream";

const deps = useTestDeps();
const decoder = new TextDecoder();

afterEach(() => setJobEventTimingForTests());

type Frame = { event: string; data: unknown };

/** Event blocks only: comment blocks (`: ping`) are dropped, as EventSource ignores them. */
function parseFrames(text: string): Frame[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "" && !block.startsWith(":"))
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "";
      const data: unknown = JSON.parse(lines.find((l) => l.startsWith("data: "))?.slice(6) ?? "null");
      return { event, data };
    });
}

function readerOf(res: Response): ReadableStreamDefaultReader<Uint8Array> {
  if (!res.body) throw new Error("expected a streaming body");
  return res.body.getReader();
}

/** Reads until `n` more frames arrived or the stream closed. */
async function readFrames(reader: ReadableStreamDefaultReader<Uint8Array>, n: number): Promise<string> {
  let text = "";
  while ((text.match(/\n\n/g) ?? []).length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

async function readToEnd(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
}

async function newJob(ownerId: string, status: CrewJob["status"] = "queued"): Promise<string> {
  const [row] = await deps()
    .db.insert(crewJobs)
    .values({ ownerId, kind: "crew_request", status, usageMonth: "2026-10" })
    .returning();
  if (!row) throw new Error("job insert failed");
  return row.id;
}

function open(cookie: string | undefined, id: string, signal?: AbortSignal): Promise<Response> {
  const req = request(`/jobs/${id}/events`, cookie ? { cookie } : {});
  return events(signal ? new Request(req, { signal }) : req, params({ id }));
}

describe("GET /jobs/:id/events (CR-06)", () => {
  it("streams the current job, each status or progress change, then end on a terminal status", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 5_000 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const res = await open(cookie, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    // R3E-1: no-transform stops Next's compression; X-Accel-Buffering stops nginx buffering.
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("content-encoding")).toBeNull();
    const reader = readerOf(res);
    let text = await readFrames(reader, 1);
    await deps()
      .db.update(crewJobs)
      .set({ status: "working", progress: [{ at: TEST_NOW, role: "scout", text: "Checking deadlines" }] })
      .where(eq(crewJobs.id, id));
    text += await readFrames(reader, 1);
    await deps().db.update(crewJobs).set({ status: "ready" }).where(eq(crewJobs.id, id));
    text += await readToEnd(reader);
    const frames = parseFrames(text);
    expect(frames.map((f) => f.event)).toEqual(["job", "job", "job", "end"]);
    expect(frames.slice(0, 3).map((f) => (f.data as CrewJob).status)).toEqual(["queued", "working", "ready"]);
    expect((frames[1]?.data as CrewJob).progress).toHaveLength(1);
    expect(frames[3]?.data).toEqual({});
    expect(text).toContain(`event: job\ndata: {"id":"${id}"`);
  });

  it("ends right away for a job that already finished", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id, "failed");
    const frames = parseFrames(await (await open(cookie, id)).text());
    expect(frames.map((f) => f.event)).toEqual(["job", "end"]);
  });

  it("sends end after the timeout when nothing changes", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 150 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const started = Date.now();
    const frames = parseFrames(await (await open(cookie, id)).text());
    expect(frames.map((f) => f.event)).toEqual(["job", "end"]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });

  it("writes a : ping comment while nothing changes (R3E-2)", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 200, pingMs: 50 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const text = await (await open(cookie, id)).text();
    expect((text.match(/^: ping\n\n/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(parseFrames(text).map((f) => f.event)).toEqual(["job", "end"]);
  });

  it("stops without an end frame when the client disconnects", async () => {
    setJobEventTimingForTests({ pollMs: 20, timeoutMs: 10_000 });
    const { user, cookie } = await signedInStudent(deps().db);
    const id = await newJob(user.id);
    const abort = new AbortController();
    const reader = readerOf(await open(cookie, id, abort.signal));
    expect(parseFrames(await readFrames(reader, 1)).map((f) => f.event)).toEqual(["job"]);
    const started = Date.now();
    abort.abort();
    expect(parseFrames(await readToEnd(reader))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("answers 404 JSON for other students' jobs and 401 signed out", async () => {
    const owner = await signedInStudent(deps().db);
    const id = await newJob(owner.user.id);
    const other = await signedInStudent(deps().db);
    const res = await open(other.cookie, id);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect((await open(undefined, id)).status).toBe(401);
  });
});
