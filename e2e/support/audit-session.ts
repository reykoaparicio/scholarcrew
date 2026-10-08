import { createHash, randomBytes } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { BASE_URL, e2eDatabaseUrl } from "./env";

/** Seeded fictional accounts only, in the disposable database. Avoids external email in production audits. */
export async function auditSession(browser: Browser, email: string): Promise<BrowserContext> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  const token = randomBytes(32).toString("base64url");
  try {
    const [user] = await sql`select id from users where email = ${email}`;
    if (!user) throw new Error(`Missing audit seed: ${email}`);
    await sql`insert into sessions (user_id, token_hash, expires_at) values
      (${user.id}, ${createHash("sha256").update(token).digest("hex")}, now() + interval '1 hour')`;
  } finally {
    await sql.end();
  }
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addCookies([{ name: "sc_session", value: token, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  return context;
}

/** An isolated empty student fixture, optionally paused before onboarding. */
export async function emptyAuditSession(browser: Browser, complete = true): Promise<BrowserContext> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  const email = `audit-${randomBytes(8).toString("hex")}@example.test`;
  try {
    const [user] =
      await sql`insert into users (email,display_name,birth_year) values (${email}, 'Audit student', 2008) returning id`;
    if (!user) throw new Error("Missing audit user");
    await sql`insert into profiles (user_id,class_year,state,onboarding_completed_at) values (${user.id},2027,'TX',${complete ? new Date() : null})`;
  } finally {
    await sql.end();
  }
  return auditSession(browser, email);
}
