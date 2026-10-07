import { FiltersCard } from "@/components/public/DirectoryFilters";
import { LabelLegend, ResultsCard, SignupCard } from "@/components/public/ListingRow";
import styles from "@/components/public/directory.module.css";
import { PAGE_SIZE, hasFilters, readFilters, toQuery } from "@/components/public/listings";
import type { SearchParams } from "@/components/public/params";
import { stateFromParam, stateHref } from "@/components/public/states";
import { plural } from "@/lib/format";
import { getDeps } from "@/server/deps";
import { searchScholarships } from "@scholarcrew/core/scholarships";
import { PUBLIC_ACTOR, STATE_NAMES } from "@scholarcrew/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ state: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = stateFromParam((await params).state);
  if (!code) return { title: "Scholarship directory · ScholarCrew" };
  const name = STATE_NAMES[code];
  return {
    title: `${name} scholarships · ScholarCrew`,
    description: `Local and statewide scholarships for ${name} students, each checked against its source with the date we checked. No account needed.`,
    alternates: { canonical: stateHref(code) },
  };
}

export default async function StateDirectoryPage({ params, searchParams }: Props) {
  const code = stateFromParam((await params).state);
  if (!code) notFound();
  const filters = readFilters(await searchParams);
  const deps = getDeps();
  const now = deps.clock.now();
  // The state total is one count query (pageSize 1) with the same open-today rule, not a full load of every row.
  const [stateTotal, page] = await Promise.all([
    searchScholarships(deps, PUBLIC_ACTOR, { ...toQuery(readFilters({}), now, code), pageSize: 1 }).then(
      (p) => p.total,
    ),
    searchScholarships(deps, PUBLIC_ACTOR, toQuery(filters, now, code)),
  ]);
  const name = STATE_NAMES[code];
  const base = stateHref(code);
  const count = hasFilters(filters)
    ? `${page.total} of ${stateTotal} match your filters`
    : plural(stateTotal, "listing");
  return (
    <div className={styles.dir}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/directory">Directory</a>
        <span aria-hidden="true">›</span>
        <b>{name}</b>
      </nav>
      <div className={styles.head}>
        <div>
          <h1>{`${name} scholarships`}</h1>
          <p className={styles.sub}>
            {`${count} · each one checked against its source, with the date we checked · no account needed`}
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <FiltersCard base={base} filters={filters} />
        <ResultsCard
          items={page.items}
          page={page.page}
          pageSize={PAGE_SIZE}
          total={page.total}
          base={base}
          filters={filters}
          now={now}
        />
        <aside className={styles.side}>
          <SignupCard />
          <LabelLegend />
        </aside>
      </div>
    </div>
  );
}
