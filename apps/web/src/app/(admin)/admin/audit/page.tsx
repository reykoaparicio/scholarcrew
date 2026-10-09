import styles from "@/components/admin/admin.module.css";
import { ADMIN_TZ } from "@/components/admin/labels";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { searchAudit } from "@scholarcrew/core/admin";
import { type AuditEvent, AuditQueryParams, type Page } from "@scholarcrew/domain";
import { Button, Card, EmptyState, Table, type TableColumn, TextInput } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

const KEYS = ["actorId", "entityType", "entityId", "action"] as const;
const WHEN = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: ADMIN_TZ });

const COLUMNS: TableColumn<AuditEvent>[] = [
  { key: "createdAt", header: "When", render: (e) => WHEN.format(new Date(e.createdAt)) },
  { key: "actor", header: "Actor", render: (e) => (e.actorId ? `${e.actorKind} ${e.actorId}` : e.actorKind) },
  { key: "action", header: "Action" },
  { key: "entity", header: "Entity", render: (e) => `${e.entityType} ${e.entityId}` },
  {
    key: "meta",
    header: "Details",
    render: (e) => {
      const text = JSON.stringify(e.meta);
      return text === "{}" ? "" : text.length > 160 ? `${text.slice(0, 157)}...` : text;
    },
  },
];

/** AD-05: search audit events by actor, entity, and action. Blank fields are left out of the query. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const key of [...KEYS, "page"]) {
    const value = firstParam(sp, key)?.trim();
    if (value) raw[key] = value;
  }
  const parsed = AuditQueryParams.safeParse(raw);
  const page: Page<AuditEvent> | null = parsed.success ? await searchAudit(getDeps(), actor, parsed.data) : null;
  const link = (n: number) => {
    const p = new URLSearchParams(raw);
    p.set("page", String(n));
    return `/admin/audit?${p.toString()}`;
  };
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Audit log</h1>
          <p className={styles.sub}>Sign-ins, sharing changes, exports, deletions, admin edits, and helper-link use.</p>
        </div>
      </div>
      <form method="get" action="/admin/audit" className={styles.formGrid}>
        <TextInput label="Actor ID" name="actorId" defaultValue={raw.actorId ?? ""} />
        <TextInput label="Action" name="action" placeholder="sensitive_facts_changed" defaultValue={raw.action ?? ""} />
        <TextInput
          label="Entity type"
          name="entityType"
          placeholder="scholarship"
          defaultValue={raw.entityType ?? ""}
        />
        <TextInput label="Entity ID" name="entityId" defaultValue={raw.entityId ?? ""} />
        <div className={styles.row}>
          <Button type="submit" variant="primary" size="sm">
            Search
          </Button>
          <Button variant="line" size="sm" href="/admin/audit">
            Clear
          </Button>
        </div>
      </form>
      {page && page.items.length === 0 ? (
        <EmptyState title="No events match these filters" icon="search">
          Try a different actor, action, or entity.
        </EmptyState>
      ) : page ? (
        <>
          <Card>
            <Table columns={COLUMNS} rows={page.items} rowKey={(e) => e.id} caption={`${page.total} events`} />
          </Card>
          <nav className={cx(styles.row, styles.pager)} aria-label="Pages">
            <span className={styles.sub}>{`Page ${page.page} of ${pages}`}</span>
            {page.page > 1 ? (
              <Button variant="line" size="sm" href={link(page.page - 1)}>
                Previous
              </Button>
            ) : null}
            {page.page < pages ? (
              <Button variant="line" size="sm" href={link(page.page + 1)}>
                Next
              </Button>
            ) : null}
          </nav>
        </>
      ) : (
        <p role="alert" className={styles.alert}>
          Check the filters: the actor ID must be a full ID, and text filters are 60 characters or less.
        </p>
      )}
    </>
  );
}
