import { FiltersCard } from "@/components/public/DirectoryFilters";
import { LabelLegend, ResultsCard, SignupCard } from "@/components/public/ListingRow";
import styles from "@/components/public/directory.module.css";
import { PAGE_SIZE, readFilters, toQuery } from "@/components/public/listings";
import type { SearchParams } from "@/components/public/params";
import { stateHref } from "@/components/public/states";
import { getDeps } from "@/server/deps";
import { searchScholarships } from "@scholarcrew/core/scholarships";
import { PUBLIC_ACTOR, STATE_NAMES, US_STATES } from "@scholarcrew/domain";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scholarship directory · ScholarCrew",
  description:
    "Local, state, and national scholarships, each checked against its source with the date we checked. No account needed.",
};

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = readFilters(await searchParams);
  const deps = getDeps();
  const now = deps.clock.now();
  const page = await searchScholarships(deps, PUBLIC_ACTOR, toQuery(filters, now));
  return (
    <div className={styles.dir}>
      <div className={styles.head}>
        <div>
          <h1>Scholarship directory</h1>
          <p className={styles.sub}>
            Each listing is checked against its source, with the date we checked · no account needed
          </p>
        </div>
      </div>
      <section className={styles.states} aria-labelledby="states-h">
        <h2 id="states-h">Browse by state</h2>
        <ul>
          {US_STATES.map((s) => (
            <li key={s}>
              <a href={stateHref(s)}>{STATE_NAMES[s]}</a>
            </li>
          ))}
        </ul>
      </section>
      <div className={styles.grid}>
        <FiltersCard base="/directory" filters={filters} />
        <ResultsCard
          items={page.items}
          page={page.page}
          pageSize={PAGE_SIZE}
          total={page.total}
          base="/directory"
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
