import { describe, expect, it } from "vitest";
import { errorText, waitUntilReady } from "./retry";

function failTimes(times: number) {
  let calls = 0;
  const probe = async () => {
    calls += 1;
    if (calls <= times) {
      throw new Error(`refused ${calls}`);
    }
  };
  return { probe, calls: () => calls };
}

async function run(probe: () => Promise<void>, attempts: number) {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  const result = await waitUntilReady(probe, { attempts, delayMs: 1000, sleep });
  return { result, sleeps };
}

describe("waitUntilReady", () => {
  it("returns after the first successful probe without sleeping", async () => {
    const { result, sleeps } = await run(failTimes(0).probe, 30);
    expect(result).toEqual({ ok: true, attempts: 1 });
    expect(sleeps).toEqual([]);
  });

  it("sleeps between attempts until the probe succeeds", async () => {
    const flaky = failTimes(2);
    const { result, sleeps } = await run(flaky.probe, 30);
    expect(result).toEqual({ ok: true, attempts: 3 });
    expect(flaky.calls()).toBe(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("gives up after the last attempt and reports the last error", async () => {
    const down = failTimes(100);
    const { result, sleeps } = await run(down.probe, 30);
    expect(result).toEqual({ ok: false, attempts: 30, lastError: "refused 30" });
    expect(down.calls()).toBe(30);
    expect(sleeps).toHaveLength(29);
  });

  it("makes no attempts when attempts is 0", async () => {
    const never = failTimes(0);
    const { result, sleeps } = await run(never.probe, 0);
    expect(result).toEqual({ ok: false, attempts: 0, lastError: "no attempts made" });
    expect(never.calls()).toBe(0);
    expect(sleeps).toEqual([]);
  });
});

describe("errorText", () => {
  it("uses the message, then the error code, then the error name", () => {
    const refused = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    expect(errorText(new Error("connect ECONNREFUSED"))).toBe("connect ECONNREFUSED");
    expect(errorText(refused)).toBe("ECONNREFUSED");
    expect(errorText(new AggregateError([], ""))).toBe("AggregateError");
    expect(errorText("plain string")).toBe("plain string");
  });
});
