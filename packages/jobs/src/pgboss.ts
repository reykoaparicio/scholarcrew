import PgBoss from "pg-boss";

export type PgBossRole = "worker" | "sender";

/**
 * "worker" (default) runs maintenance and cron. "sender" (web) only sends:
 * supervise and schedule are off. `schema` exists for test isolation.
 */
export function createPgBoss(url: string, opts: { role?: PgBossRole; schema?: string } = {}): PgBoss {
  const role = opts.role ?? "worker";
  const boss = new PgBoss({
    connectionString: url,
    schema: opts.schema ?? "pgboss",
    ...(role === "sender" ? { supervise: false, schedule: false } : {}),
  });
  boss.on("error", (error: Error) => {
    console.error(JSON.stringify({ level: "error", msg: "pgboss", role, error: String(error) }));
  });
  return boss;
}
