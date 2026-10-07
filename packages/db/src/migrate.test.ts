import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { devOutbox, families, users } from "./schema";
import { EXPECTED_ENUMS, EXPECTED_TABLES } from "./schema/expected";
import { TABLE_NAMES, closeTestDb, getTestDb, resetDb } from "./testing/db";
import { testDatabaseUrl } from "./testing/env";

const db = getTestDb();

beforeEach(() => resetDb(db));
afterAll(() => closeTestDb());

function column(rows: Iterable<Record<string, unknown>>, key: string): string[] {
  return Array.from(rows, (row) => String(row[key])).sort();
}

describe("migrations", () => {
  it("create every section 8 table", async () => {
    const rows = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(column(rows, "table_name")).toEqual(EXPECTED_TABLES);
  });

  it("create every section 8 enum", async () => {
    const rows = await db.execute(
      sql`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e' and n.nspname = 'public'`,
    );
    expect(column(rows, "typname")).toEqual(EXPECTED_ENUMS);
  });

  it("can run again when nothing changed", async () => {
    await expect(runMigrations(testDatabaseUrl())).resolves.toBeUndefined();
  });

  it("gives offers a nullable archived_at timestamptz", async () => {
    const rows = await db.execute(
      sql`select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'offers' and column_name = 'archived_at'`,
    );
    expect(Array.from(rows)).toEqual([{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
  });

  it("gives rec_requests a message text column, not null, default '' (D38)", async () => {
    const rows = await db.execute(
      sql`select data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'rec_requests' and column_name = 'message'`,
    );
    expect(Array.from(rows)).toEqual([{ data_type: "text", is_nullable: "NO", column_default: "''::text" }]);
  });

  it("applies the round 2 column changes (R2C-4, R2I-6, R2I-9, R2I-19)", async () => {
    const rows = await db.execute(
      sql`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
          where table_schema = 'public' and (
            (table_name = 'plan_items' and column_name = 'generated') or
            (table_name = 'family_tasks' and column_name = 'aid_item_id') or
            (table_name = 'notifications' and column_name = 'sms_sent_at') or
            (table_name = 'subscriptions' and column_name = 'family_id'))
          order by table_name`,
    );
    expect(Array.from(rows)).toEqual([
      {
        table_name: "family_tasks",
        column_name: "aid_item_id",
        data_type: "uuid",
        is_nullable: "YES",
        column_default: null,
      },
      {
        table_name: "notifications",
        column_name: "sms_sent_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
        column_default: null,
      },
      {
        table_name: "plan_items",
        column_name: "generated",
        data_type: "boolean",
        is_nullable: "NO",
        column_default: "false",
      },
    ]);
    const constraints = await db.execute(
      sql`select conname, contype::text as contype, case when contype = 'f' then confdeltype::text end as on_delete from pg_constraint
          where conrelid = 'family_tasks'::regclass and conname in ('family_tasks_aid_item_assignee_uq', 'family_tasks_aid_item_id_aid_checklist_items_id_fk')
          order by conname`,
    );
    expect(Array.from(constraints)).toEqual([
      { conname: "family_tasks_aid_item_assignee_uq", contype: "u", on_delete: null },
      { conname: "family_tasks_aid_item_id_aid_checklist_items_id_fk", contype: "f", on_delete: "c" },
    ]);
  });
});

describe("resetDb", () => {
  it("empties every schema table", async () => {
    const [user] = await db.insert(users).values({ email: "reset@example.test" }).returning();
    await db.insert(families).values({ createdById: user?.id ?? null });
    await db.insert(devOutbox).values({ to: "reset@example.test", subject: "Sign in", text: "Your link" });
    await resetDb(db);
    const counts = await Promise.all(
      TABLE_NAMES.map(async (name) => {
        const rows = await db.execute(sql.raw(`select count(*)::int as n from "${name}"`));
        return Number(rows[0]?.n);
      }),
    );
    expect(TABLE_NAMES).toEqual(EXPECTED_TABLES);
    expect(counts.every((n) => n === 0)).toBe(true);
  });

  it("leaves drizzle's migrations table alone", async () => {
    const rows = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
  });
});
