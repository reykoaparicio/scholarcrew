import { and, eq, serviceLogs, users } from "@scholarcrew/db";
import {
  type Actor,
  PUBLIC_ACTOR,
  type ServiceLog,
  type VerificationRequestView,
  type VerificationSubmitInput,
  conflict,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { firstName, firstRow, hoursFromMinutes, requireUser } from "../scholarships/common";
import { type CoreDeps, calendarShort, instantInZone, toIso } from "../shared";
import { toServiceLog } from "./mappers";
import { ownedLog } from "./service";

export const VERIFY_LINK_DAYS = 14;

export async function requestVerification(deps: CoreDeps, actor: Actor, id: string): Promise<ServiceLog> {
  requireUser(actor);
  const row = await ownedLog(deps, actor, id);
  if (!row.supervisorEmail) throw invalidInput("Add your supervisor's email before asking them to confirm.");
  if (row.verification === "verified") throw conflict("These hours are already verified.");
  const token = randomToken();
  const now = deps.clock.now();
  if (
    row.verification === "requested" &&
    row.verificationExpiresAt &&
    row.verificationExpiresAt.getTime() > now.getTime() + 13 * 86_400_000
  )
    throw conflict("We sent that request today. The link in it still works.");
  const expiresAt = new Date(now.getTime() + VERIFY_LINK_DAYS * 86_400_000);
  const updated = firstRow(
    await deps.db
      .update(serviceLogs)
      .set({
        verification: "requested",
        verificationTokenHash: sha256Hex(token),
        verificationExpiresAt: expiresAt,
        verifiedAt: null,
        verifierNote: "",
      })
      .where(and(eq(serviceLogs.id, id), eq(serviceLogs.ownerId, row.ownerId)))
      .returning(),
    "service log",
  );
  const [owner] = await deps.db
    .select({ displayName: users.displayName, timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, row.ownerId));
  const name = firstName(owner?.displayName ?? "");
  const studentTimeZone = owner?.timeZone ?? "America/Chicago";
  await deps.email.send({
    to: row.supervisorEmail,
    subject: `Can you confirm ${name}'s volunteer hours?`,
    text: [
      `Hi ${row.supervisorName || "there"},`,
      "",
      `${name} logged volunteer hours with ${row.organization} and asked you to confirm them:`,
      "",
      `${row.activity} on ${calendarShort(row.servedOn)}: ${hoursFromMinutes(row.minutes)} hours`,
      "",
      "Confirm or decline here (no account needed):",
      `${deps.config.appUrl}/verify-hours/${token}`,
      "",
      // R3E-8: the link dies at this instant; a UTC date could read a day late for the supervisor.
      `The link expires ${instantInZone(expiresAt, studentTimeZone)}.`,
      "",
      "ScholarCrew",
    ].join("\n"),
  });
  return toServiceLog(updated);
}

async function findOpenRequest(deps: CoreDeps, token: string) {
  if (!token) return null;
  const [row] = await deps.db
    .select({ log: serviceLogs, displayName: users.displayName })
    .from(serviceLogs)
    .innerJoin(users, eq(users.id, serviceLogs.ownerId))
    .where(eq(serviceLogs.verificationTokenHash, sha256Hex(token)));
  if (!row) return null;
  const expires = row.log.verificationExpiresAt;
  if (row.log.verification !== "requested" || !expires || expires.getTime() <= deps.clock.now().getTime()) return null;
  return row;
}

export async function getVerificationRequest(deps: CoreDeps, token: string): Promise<VerificationRequestView | null> {
  const found = await findOpenRequest(deps, token);
  if (!found || !found.log.verificationExpiresAt) return null;
  return {
    studentFirstName: firstName(found.displayName),
    organization: found.log.organization,
    activity: found.log.activity,
    servedOn: found.log.servedOn,
    minutes: found.log.minutes,
    expiresAt: toIso(found.log.verificationExpiresAt),
  };
}

export async function submitVerification(deps: CoreDeps, token: string, i: VerificationSubmitInput): Promise<void> {
  const found = await findOpenRequest(deps, token);
  if (!found) throw notFound("This link has expired or was already used.");
  const now = deps.clock.now();
  const rows = await deps.db
    .update(serviceLogs)
    .set({
      verification: i.confirmed ? "verified" : "declined",
      verifiedAt: i.confirmed ? now : null,
      verifierNote: i.note.trim(),
      verificationTokenHash: null,
      verificationExpiresAt: null,
    })
    .where(and(eq(serviceLogs.id, found.log.id), eq(serviceLogs.verificationTokenHash, sha256Hex(token))))
    .returning({ id: serviceLogs.id });
  if (rows.length === 0) throw notFound("This link has expired or was already used.");
  await recordAudit(deps, {
    actor: PUBLIC_ACTOR,
    action: i.confirmed ? "service_log.verified" : "service_log.declined",
    entityType: "service_log",
    entityId: found.log.id,
  });
}
