import { type Db, devOutbox } from "@scholarcrew/db";
import { AppError } from "@scholarcrew/domain";
import type { EmailSender } from "./types";

/** A subject is one line: a newline from user text (a display name) would get the send rejected (R3E-10). */
const oneLine = (subject: string): string => subject.replace(/[\r\n]+/g, " ");

/** Dev and test sender: stores each message in dev_outbox (read by /api/v1/dev/outbox/latest). */
export function devOutboxEmailSender(db: Db): EmailSender {
  return {
    async send(m) {
      await db.insert(devOutbox).values({ to: m.to.toLowerCase(), subject: oneLine(m.subject), text: m.text });
    },
  };
}

/** Production sender over Resend's REST API. Never logs the body. */
export function resendEmailSender(apiKey: string, from: string): EmailSender {
  return {
    async send(m, o) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(o?.idempotencyKey ? { "Idempotency-Key": o.idempotencyKey } : {}),
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ from, to: [m.to], subject: oneLine(m.subject), text: m.text }),
      });
      if (!res.ok)
        throw new AppError("internal", `Email send failed with status ${res.status}`, { status: res.status });
    },
  };
}
