import { afterEach, describe, expect, it, vi } from "vitest";
import { createPgBoss } from "./pgboss";

const FAKE_URL = "postgres://scholarcrew:secret-password@localhost:1/unused";

describe("createPgBoss", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs pg-boss errors as one JSON line without the connection string", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boss = createPgBoss(FAKE_URL);
    boss.emit("error", new Error("boom"));
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({ level: "error", msg: "pgboss", role: "worker", error: "Error: boom" });
    expect(line).not.toContain("secret-password");
  });

  it("labels the send-only role", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    createPgBoss(FAKE_URL, { role: "sender" }).emit("error", new Error("down"));
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      level: "error",
      msg: "pgboss",
      role: "sender",
      error: "Error: down",
    });
  });
});
