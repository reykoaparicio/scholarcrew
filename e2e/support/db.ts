import postgres from "postgres";
import { e2eDatabaseUrl } from "./env";

async function usingSql<T>(work: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => undefined });
  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Privacy regression fixtures are restricted to the disposable E2E database. */
export async function seedPrivateAward(userId: string): Promise<string> {
  return usingSql(async (sql) => {
    const [listing] =
      await sql`insert into scholarships (slug,name,provider,url,source_url,amount_min_usd,amount_max_usd,cycle,local_area,requirements,status)
      values (${`private-${userId}`}, 'PRIVATE_E2E_AWARD', 'E2E', 'https://example.org/private', 'https://example.org/private', 1000, 1000, '2026-27', '{"national":true,"state":null,"counties":[],"cities":[]}'::jsonb, '{"essays":[],"recommendations":0,"transcript":false,"serviceHours":null,"other":[]}'::jsonb, 'published') returning id`;
    if (!listing) throw new Error("Private award fixture failed");
    await sql`insert into scholarship_applications (owner_id,scholarship_id,stage,match_reasons) values (${userId}, ${listing.id}, 'planned', '[{"code":"heritage","text":"Private criterion matched","sensitive":true}]'::jsonb)`;
    return String(listing.id);
  });
}

export async function sensitiveAudit(userId: string): Promise<string> {
  return usingSql(async (sql) =>
    JSON.stringify(
      await sql`select action,meta from audit_events where actor_id = ${userId} and action = 'sensitive_facts_changed'`,
    ),
  );
}

/** G3 fixture write 1: test expiry without waiting a day. */
export async function expireHelperLink(linkId: string): Promise<void> {
  await usingSql(async (sql) => {
    const rows =
      await sql`update helper_links set expires_at = now() - interval '1 minute' where id = ${linkId} returning id`;
    if (rows.length !== 1) throw new Error(`Helper link ${linkId} not found in the e2e database`);
  });
}

/** G3 fixture write 2: exhaust the UTC-month allowance without model calls. */
export async function setUsage(userId: string, month: string, n: number): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isSafeInteger(n) || n < 0) throw new Error("Invalid usage fixture");
  await usingSql(async (sql) => {
    await sql`insert into usage_counters (user_id, month, crew_requests, cost_micros)
      values (${userId}, ${month}, ${n}, 0)
      on conflict (user_id, month) do update set crew_requests = excluded.crew_requests`;
  });
}

/** G3 fixture write 3: simulate an abandoned lease. Call after the demo attempt has finished to avoid a worker race. */
export async function expireJobLease(jobId: string): Promise<void> {
  await usingSql(async (sql) => {
    const rows = await sql`update crew_jobs set status = 'working', attempt = 1, lease_token = gen_random_uuid(),
      lease_expires_at = now() - interval '11 minutes', updated_at = now() - interval '11 minutes'
      where id = ${jobId} returning id`;
    if (rows.length !== 1) throw new Error(`Crew job ${jobId} not found`);
  });
}

/** G3 fixture write 4: verify college visibility across rollover without changing the clock. */
export async function setCollegeSeason(entryId: string, season: string): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(season)) throw new Error("Invalid season fixture");
  await usingSql(async (sql) => {
    const rows = await sql`update college_list set season = ${season} where id = ${entryId} returning id`;
    if (rows.length !== 1) throw new Error(`College entry ${entryId} not found`);
  });
}
