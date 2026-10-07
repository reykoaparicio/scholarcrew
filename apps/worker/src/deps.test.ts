import { devOutbox, eq } from "@scholarcrew/db";
import { getTestDb, testDatabaseUrl } from "@scholarcrew/db/testing";
import { ParsedOffer } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { DEMO_OFFER } from "./demo-model";
import { allowedDomains, buildWorkerDeps } from "./deps";

const KEY = "ab".repeat(32);
const env = (o: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: testDatabaseUrl(),
  ENCRYPTION_KEY: KEY,
  SCHOLARCREW_FAKE_MODEL: "1",
  RESEND_API_KEY: "",
  ...o,
});

describe("buildWorkerDeps", () => {
  it("refuses to start without required config", () => {
    expect(() => buildWorkerDeps(env({ DATABASE_URL: undefined }))).toThrow("DATABASE_URL is not set");
    expect(() => buildWorkerDeps(env({ ENCRYPTION_KEY: "short" }))).toThrow(
      "Encryption key must be 32 bytes of hex with a key id",
    );
    expect(() => buildWorkerDeps(env({ SCHOLARCREW_FAKE_MODEL: "0", ANTHROPIC_API_KEY: "" }))).toThrow(
      "ANTHROPIC_API_KEY is not set",
    );
  });

  it("uses the demo model, catalog fakes, and the dev outbox in fake mode", async () => {
    const built = buildWorkerDeps(env({ CATALOG_ALLOWED_DOMAINS: " a.org, ,b.org " }));
    try {
      expect(built.fakeModel).toBe(true);
      const res = await built.model.extract({
        role: "aid",
        system: "S",
        content: [],
        schema: ParsedOffer,
        effort: "high",
        maxTokens: 100,
      });
      expect(res.value).toEqual(DEMO_OFFER);
      expect(await built.catalog.researcher.findCandidates({ state: "TX", allowedDomains: [] })).toEqual([]);
      expect(built.catalog.allowedDomains).toEqual(["a.org", "b.org"]);
      expect(typeof built.catalog.onUsage).toBe("function");
      expect(built.core.config).toMatchObject({ appUrl: "http://localhost:3000", sessionDays: 30 });
      expect(built.core.config.keyring.primary.key.equals(Buffer.from(KEY, "hex"))).toBe(true);
      expect(built.core.stripe).toBeNull();
      await built.core.email.send({ to: "Jordan@Example.test", subject: "Hi", text: "Body" });
      const rows = await getTestDb().select().from(devOutbox).where(eq(devOutbox.to, "jordan@example.test"));
      expect(rows).toHaveLength(1);
    } finally {
      await built.close();
    }
  });

  it("builds the real clients without touching the network", async () => {
    const built = buildWorkerDeps(
      env({
        SCHOLARCREW_FAKE_MODEL: "0",
        ANTHROPIC_API_KEY: "sk-ant-test-key",
        APP_URL: "https://scholarcrew.example",
      }),
    );
    try {
      expect(built.fakeModel).toBe(false);
      expect(typeof built.model.turn).toBe("function");
      expect(typeof built.catalog.fetchPage).toBe("function");
      expect(typeof built.catalog.onUsage).toBe("function");
      expect(built.core.config.appUrl).toBe("https://scholarcrew.example");
    } finally {
      await built.close();
    }
  });
});

describe("allowedDomains", () => {
  it("drops blanks", () => {
    expect(allowedDomains(undefined)).toEqual([]);
    expect(allowedDomains("")).toEqual([]);
    expect(allowedDomains("example.org,  scholarships.example.com ,")).toEqual([
      "example.org",
      "scholarships.example.com",
    ]);
  });
});
