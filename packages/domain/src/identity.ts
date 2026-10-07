import { z } from "zod";
import { type HelperScope, Id, IsoDateTime, Role } from "./common";

export const UserStatus = z.enum(["active", "blocked_underage", "deleted"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const User = z.strictObject({
  id: Id,
  email: z.email(),
  displayName: z.string(),
  role: Role,
  birthYear: z.number().int().nullable(),
  timeZone: z.string(),
  status: UserStatus,
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

export const MagicLinkRequest = z.strictObject({ email: z.email().max(254) });
export type MagicLinkRequest = z.infer<typeof MagicLinkRequest>;

export type UserActor = { kind: "user"; userId: string; role: Role };
export type HelperActor = { kind: "helper"; helperLinkId: string; studentId: string; scope: HelperScope[] };
export type SystemActor = { kind: "system"; reason: string };
export type PublicActor = { kind: "public" };
export type Actor = UserActor | HelperActor | SystemActor | PublicActor;

export const userActor = (userId: string, role: Role): UserActor => ({ kind: "user", userId, role });
export const systemActor = (reason: string): SystemActor => ({ kind: "system", reason });
export const PUBLIC_ACTOR: PublicActor = { kind: "public" };
