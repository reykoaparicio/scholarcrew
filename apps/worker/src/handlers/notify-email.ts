import { deliverEmail } from "@scholarcrew/core/notifications";
import { JobPayloads } from "@scholarcrew/jobs";
import type { WorkerDeps } from "../types";
import { SYSTEM } from "./shared";

/** Core checks prefs, quiet hours, and emailedAt, so a retry never sends twice. */
export async function handleNotifyEmail(deps: WorkerDeps, data: unknown): Promise<void> {
  const { notificationId } = JobPayloads["notify.email"].parse(data);
  await deliverEmail(deps.core, SYSTEM, notificationId);
}
