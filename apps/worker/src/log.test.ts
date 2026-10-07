import { AppError } from "@scholarcrew/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { errorLabel, log } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("writes one JSON line per call, errors to stderr", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log("info", "job.done", { name: "crew.request", ms: 12 });
    log("warn", "job.retry");
    log("error", "job.error", { name: "offer.parse" });
    expect(out.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { level: "info", msg: "job.done", name: "crew.request", ms: 12 },
      { level: "warn", msg: "job.retry" },
    ]);
    expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toEqual({
      level: "error",
      msg: "job.error",
      name: "offer.parse",
    });
  });
});

describe("errorLabel", () => {
  it("labels errors without their messages", () => {
    expect(errorLabel(new AppError("not_found", "Essay about my grandmother not found"))).toBe("code=not_found");
    expect(errorLabel(z.strictObject({ jobId: z.uuid() }).safeParse({}).error)).toBe("unknown");
    expect(errorLabel(new TypeError("secret text"))).toBe("unknown");
    expect(errorLabel("boom")).toBe("unknown");
  });
});
