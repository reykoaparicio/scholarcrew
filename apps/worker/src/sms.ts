import type { SmsSender } from "@scholarcrew/core/shared";
import { type Db, devOutbox } from "@scholarcrew/db";

export const TWILIO_API = "https://api.twilio.com/2010-04-01";
export const SMS_TIMEOUT_MS = 10_000;

/** Twilio's REST API over fetch (00 §2). A non-2xx response throws `twilio <status> <code>`, never the message text. */
export function twilioSmsSender(o: {
  accountSid: string;
  authToken: string;
  from: string;
  fetchImpl?: typeof fetch;
}): SmsSender {
  const fetchImpl = o.fetchImpl ?? fetch;
  const url = `${TWILIO_API}/Accounts/${encodeURIComponent(o.accountSid)}/Messages.json`;
  const authorization = `Basic ${Buffer.from(`${o.accountSid}:${o.authToken}`).toString("base64")}`;
  return {
    async send(m) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: m.to, From: o.from, Body: m.text }),
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
      });
      if (res.ok) return;
      // Twilio's error `message` can quote the phone number, so only the numeric code is kept.
      let code = "unknown";
      try {
        const body = (await res.json()) as { code?: unknown };
        if (typeof body.code === "number" || typeof body.code === "string") code = String(body.code);
      } catch {
        // Not JSON; keep "unknown".
      }
      throw new Error(`twilio ${res.status} ${code}`);
    },
  };
}

/** Local dev and tests: each text lands in dev_outbox with subject "SMS". */
export function devOutboxSmsSender(db: Db): SmsSender {
  return {
    async send(m) {
      await db.insert(devOutbox).values({ to: m.to, subject: "SMS", text: m.text });
    },
  };
}
