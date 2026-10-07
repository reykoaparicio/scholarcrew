import { devOutbox, eq } from "@scholarcrew/db";
import { getTestDb, testDatabaseUrl } from "@scholarcrew/db/testing";
import { describe, expect, it, vi } from "vitest";
import { TWILIO_PARTIAL_ERROR, buildWorkerDeps, twilioConfig } from "./deps";
import { devOutboxSmsSender, twilioSmsSender } from "./sms";

const PHONE = "+15125550100";
const FROM = "+15125550000";
const KEY = "ab".repeat(32);
const env = (o: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: testDatabaseUrl(),
  ENCRYPTION_KEY: KEY,
  SCHOLARCREW_FAKE_MODEL: "1",
  ...o,
});

describe("twilioSmsSender", () => {
  it("posts a form-encoded message with Basic auth and a timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    await twilioSmsSender({ accountSid: "AC123", authToken: "secret", from: FROM, fetchImpl }).send({
      to: PHONE,
      text: "ScholarCrew: hi",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      To: PHONE,
      From: FROM,
      Body: "ScholarCrew: hi",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on a non-2xx response without the phone number in the error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ code: 21211, message: `The 'To' number ${PHONE} is not valid.` }), {
          status: 400,
        }),
    );
    const sms = twilioSmsSender({ accountSid: "AC123", authToken: "secret", from: FROM, fetchImpl });
    const error = await sms.send({ to: PHONE, text: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("twilio 400 21211");
    expect((error as Error).message).not.toContain("5125550100");
  });
});

describe("devOutboxSmsSender", () => {
  it("writes one dev_outbox row with subject SMS", async () => {
    const db = getTestDb();
    await devOutboxSmsSender(db).send({ to: PHONE, text: "ScholarCrew: hi" });
    const rows = await db.select().from(devOutbox).where(eq(devOutbox.to, PHONE));
    expect(rows.map((r) => [r.subject, r.text])).toEqual([["SMS", "ScholarCrew: hi"]]);
  });
});

describe("buildWorkerDeps SMS config", () => {
  it("uses Twilio with all three TWILIO_* set, the dev outbox with none, and refuses a partial set", async () => {
    const FULL = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: FROM };
    expect(twilioConfig(env(FULL))).toEqual({ accountSid: "AC123", authToken: "secret", from: FROM });
    expect(twilioConfig(env({ TWILIO_ACCOUNT_SID: " ", TWILIO_AUTH_TOKEN: "", TWILIO_FROM: undefined }))).toBeNull();
    expect(() => buildWorkerDeps(env({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "", TWILIO_FROM: "" }))).toThrow(
      TWILIO_PARTIAL_ERROR,
    );
    expect(TWILIO_PARTIAL_ERROR).toBe(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM must all be set or all be empty",
    );
    const full = buildWorkerDeps(env(FULL));
    expect(typeof full.sms.send).toBe("function");
    await full.close();
    const dev = buildWorkerDeps(env());
    try {
      await dev.sms.send({ to: PHONE, text: "ScholarCrew: dev" });
      expect(await getTestDb().select().from(devOutbox).where(eq(devOutbox.to, PHONE))).toHaveLength(1);
    } finally {
      await dev.close();
    }
  });
});
