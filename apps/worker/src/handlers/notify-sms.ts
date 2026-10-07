import { deliverSms } from "@scholarcrew/core/notifications";
import { JobPayloads } from "@scholarcrew/jobs";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/**
 * NO-05 (R2I-9). Core checks the row, smsSentAt, the user's status, smsEnabled, and the phone; re-enqueues during
 * quiet hours; claims the send through smsSentAt; and resets the claim when the sender throws, so pg-boss retries.
 */
export async function handleNotifySms(deps: WorkerDeps, data: unknown): Promise<void> {
  const { notificationId } = JobPayloads["notify.sms"].parse(data);
  await deliverSms(deps.core, SYSTEM, notificationId, deps.sms);
}
