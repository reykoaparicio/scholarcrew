import { createTestDeps } from "@scholarcrew/core/shared";
import { devOutbox, eq } from "@scholarcrew/db";
import { getTestDb, testDatabaseUrl } from "@scholarcrew/db/testing";
import { type JobsClient, createMemoryJobsClient } from "@scholarcrew/jobs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeps,
  createLazyJobsClient,
  devRoutesEnabled,
  getDeps,
  resetDepsForTests,
  setDepsForTests,
  stripeSecretKey,
} from "./deps";

const KEY = "ab".repeat(32);
const BASE = { DATABASE_URL: testDatabaseUrl(), APP_URL: "http://localhost:3000/", ENCRYPTION_KEY: KEY };

const opened: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of opened.splice(0)) await close();
});

function build(env: Record<string, string | undefined>) {
  const built = buildDeps(env);
  opened.push(built.close);
  return built.deps;
}

describe("buildDeps", () => {
  it("accepts a rotating keyring and rejects unsafe production configuration before opening a pool", () => {
    const second = `12${"ab".repeat(31)}`;
    expect(build({ ...BASE, ENCRYPTION_KEYS: `2:${second},1:${KEY}` }).config.keyring.primary.id).toBe(2);
    expect(() => build({ ...BASE, NODE_ENV: "production" })).toThrow(/key/i);
    expect(() => build({ ...BASE, ENCRYPTION_KEYS: `2:${second}`, NODE_ENV: "production" })).toThrow(
      "RESEND_API_KEY is required in production",
    );
  });

  it("builds the core config from env", () => {
    const deps = build({
      ...BASE,
      STRIPE_PRICE_FAMILY: "price_f",
      STRIPE_PRICE_SEASON: "price_s",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    expect(deps.config).toEqual({
      appUrl: "http://localhost:3000",
      keyring: { primary: { id: 1, key: Buffer.from(KEY, "hex") }, byId: new Map([[1, Buffer.from(KEY, "hex")]]) },
      sessionDays: 30,
      stripePriceFamily: "price_f",
      stripePriceSeason: "price_s",
      stripeWebhookSecret: "whsec_x",
    });
    expect(deps.stripe).toBeNull();
    expect(Math.abs(deps.clock.now().getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("creates a Stripe gateway only when a secret key is set", () => {
    expect(build({ ...BASE, STRIPE_SECRET_KEY: "sk_test_123" }).stripe).not.toBeNull();
    expect(build({ ...BASE, STRIPE_SECRET_KEY: "" }).stripe).toBeNull();
  });

  it("writes email to dev_outbox when there is no Resend key", async () => {
    const deps = build(BASE);
    await deps.email.send({ to: "Maya@Example.test", subject: "Hi", text: "Body" });
    const rows = await getTestDb().select().from(devOutbox).where(eq(devOutbox.to, "maya@example.test"));
    expect(rows).toHaveLength(1);
  });

  it("sends email through Resend when the key is set", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const deps = build({ ...BASE, RESEND_API_KEY: "re_123", EMAIL_FROM: "Crew <crew@example.test>" });
    await deps.email.send({ to: "maya@example.test", subject: "Hi", text: "Body" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("Crew <crew@example.test>");
  });

  it("rejects missing or malformed settings before opening a pool", () => {
    expect(() => buildDeps({ ...BASE, DATABASE_URL: "" })).toThrow("Missing environment variable DATABASE_URL");
    expect(() => buildDeps({ ...BASE, APP_URL: undefined })).toThrow("Missing environment variable APP_URL");
    expect(() => buildDeps({ ...BASE, APP_URL: "not a url" })).toThrow("APP_URL must be an absolute URL");
    expect(() => buildDeps({ ...BASE, ENCRYPTION_KEY: "abc" })).toThrow(
      "Encryption key must be 32 bytes of hex with a key id",
    );
  });
});

describe("createLazyJobsClient", () => {
  it("starts the sender once, on the first enqueue", async () => {
    const inner = createMemoryJobsClient();
    const start = vi.fn(async (): Promise<JobsClient> => inner);
    const jobs = createLazyJobsClient(start);
    expect(start).not.toHaveBeenCalled();
    await Promise.all([jobs.enqueue("sweep.weekly", {}), jobs.enqueue("sweep.weekly", {})]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(inner.sent).toHaveLength(2);
  });

  it("tries to start again after a failed start", async () => {
    const inner = createMemoryJobsClient();
    const start = vi
      .fn<() => Promise<JobsClient>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(inner);
    const jobs = createLazyJobsClient(start);
    await expect(jobs.enqueue("sweep.weekly", {})).rejects.toThrow("db down");
    await jobs.enqueue("sweep.weekly", {});
    expect(start).toHaveBeenCalledTimes(2);
    expect(inner.sent).toHaveLength(1);
  });
});

describe("getDeps", () => {
  it("returns the test override and never reads env under Vitest", () => {
    const deps = createTestDeps();
    setDepsForTests(deps);
    expect(getDeps()).toBe(deps);
    resetDepsForTests();
    expect(() => getDeps()).toThrow("useTestDeps");
  });
});

describe("env switches", () => {
  it("enables dev routes only with ENABLE_DEV_ROUTES=1 outside production", () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(devRoutesEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(devRoutesEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "");
    expect(devRoutesEnabled()).toBe(false);
  });

  it("reads the Stripe secret key for webhook verification", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", " sk_test_9 ");
    expect(stripeSecretKey()).toBe("sk_test_9");
  });
});
