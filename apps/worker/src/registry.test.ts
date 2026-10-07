import { JOB_NAMES } from "@scholarcrew/jobs";
import { describe, expect, it } from "vitest";
import { makeWorkerDeps } from "../test/helpers";
import { HANDLERS } from "./registry";

describe("HANDLERS", () => {
  it("has exactly one handler per JOB_NAMES entry", () => {
    expect(JOB_NAMES).toHaveLength(20);
    expect(Object.keys(HANDLERS).sort()).toEqual([...JOB_NAMES].sort());
    expect(HANDLERS["plan.weekly.fanout"]).toBeTypeOf("function");
    expect(HANDLERS["notify.sms"]).toBeTypeOf("function");
    for (const name of JOB_NAMES) expect(typeof HANDLERS[name], name).toBe("function");
  });

  it("validates every payload before doing any work", async () => {
    const { deps, core } = makeWorkerDeps();
    for (const name of JOB_NAMES) {
      await expect(HANDLERS[name](deps, { unexpected: true }), name).rejects.toThrow();
    }
    expect(core.jobs.sent).toEqual([]);
  });
});
