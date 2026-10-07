import { SESSION_COOKIE, getSessionUser } from "@scholarcrew/core/auth";
import { type Role, type UserActor, userActor } from "@scholarcrew/domain";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "./deps";

export { clearSessionCookie, sessionCookie } from "./cookies";

/** The signed-in user for a server component, or null. */
export async function getPageActor(): Promise<UserActor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await getSessionUser(getDeps(), token);
  return user ? userActor(user.id, user.role) : null;
}

/** ID-02/ID-04: signed out → /sign-in; signed in with the wrong role → the 404 page. */
export async function requirePageActor(roles?: Role[]): Promise<UserActor> {
  const actor = await getPageActor();
  if (!actor) redirect("/sign-in");
  if (roles && roles.length > 0 && !roles.includes(actor.role)) notFound();
  return actor;
}
