import styles from "@/components/admin/admin.module.css";
import { ADMIN_TZ, CATALOG_STATUS_LABELS, adminDeadline } from "@/components/admin/labels";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { instantShort, plural } from "@/lib/format";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listScholarships } from "@scholarcrew/core/admin";
import { CatalogStatus, type Scholarship } from "@scholarcrew/domain";
import { Button, Card, EmptyState, Table, type TableColumn } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

// R3V-10: labeled statuses, deadlines with the year, instants on the admin (Central) calendar.
const COLUMNS: TableColumn<Scholarship>[] = [
  { key: "name", header: "Listing", render: (s) => <a href={`/admin/scholarships/${s.id}`}>{s.name}</a> },
  { key: "provider", header: "Provider" },
  { key: "status", header: "Status", render: (s) => CATALOG_STATUS_LABELS[s.status] },
  { key: "deadline", header: "Deadline", render: (s) => adminDeadline(s.deadline) },
  {
    key: "verifiedAt",
    header: "Verified",
    render: (s) => (s.verifiedAt ? instantShort(s.verifiedAt, ADMIN_TZ) : "Never"),
  },
];

export default async function AdminScholarshipsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const parsed = CatalogStatus.safeParse(firstParam(sp, "status"));
  const status = parsed.success ? parsed.data : undefined;
  const q = (firstParam(sp, "q") ?? "").trim().slice(0, 100);
  const asked = Number(firstParam(sp, "page"));
  const pageNo = Number.isInteger(asked) && asked >= 1 && asked <= 1000 ? asked : 1;
  const page = await listScholarships(getDeps(), actor, { status, q, page: pageNo });
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const href = (s: CatalogStatus | undefined, n = 1) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const text = p.toString();
    return text ? `/admin/scholarships?${text}` : "/admin/scholarships";
  };
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Scholarships</h1>
          <p className={styles.sub}>{`${plural(page.total, "listing")}, newest edits first`}</p>
        </div>
        <Button variant="primary" icon="plus" href="/admin/scholarships/new">
          New listing
        </Button>
      </div>
      <div className={styles.toolbar}>
        <form method="get" action="/admin/scholarships" className={styles.search}>
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="admin-q" className={styles.srOnly}>
            Search listings
          </label>
          <input id="admin-q" name="q" type="search" defaultValue={q} placeholder="Search by name or provider" />
          <Button type="submit" variant="soft" size="sm">
            Search
          </Button>
        </form>
        <div className={styles.chips}>
          {[undefined, ...CatalogStatus.options].map((s) => (
            <a key={s ?? "all"} href={href(s)} className={cx(styles.chip, s === status && styles.chipOn)}>
              {s ? CATALOG_STATUS_LABELS[s] : "All"}
            </a>
          ))}
        </div>
      </div>
      {page.items.length === 0 ? (
        <EmptyState title="No listings match" icon="search">
          Try another status or search.
        </EmptyState>
      ) : (
        <Card>
          <Table columns={COLUMNS} rows={page.items} rowKey={(s) => s.id} caption="Listings" />
        </Card>
      )}
      {pages > 1 ? (
        <nav className={styles.row} aria-label="Pages">
          <span>{`Page ${page.page} of ${pages}`}</span>
          {page.page > 1 ? <a href={href(status, page.page - 1)}>Previous</a> : null}
          {page.page < pages ? <a href={href(status, page.page + 1)}>Next</a> : null}
        </nav>
      ) : null}
    </>
  );
}
