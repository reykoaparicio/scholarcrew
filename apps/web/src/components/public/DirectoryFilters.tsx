import { cx } from "@/lib/cx";
import { usd } from "@/lib/format";
import { Button, Card } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./directory.module.css";
import { type DirectoryFilters, MIN_AMOUNTS, WITHIN_DAYS, filterHref, hasFilters } from "./listings";

function ChipLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <a href={href} className={cx(styles.chip, active && styles.chipOn)} aria-current={active ? "true" : undefined}>
      {children}
    </a>
  );
}

export function FiltersCard({ base, filters: f }: { base: string; filters: DirectoryFilters }) {
  return (
    <Card title="Filters" aside={hasFilters(f) ? <a href={base}>Clear</a> : null}>
      <search>
        <form method="get" action={base} className={styles.search}>
          <label htmlFor="directory-q" className={styles.srOnly}>
            Search by name or sponsor
          </label>
          <input id="directory-q" name="q" type="search" defaultValue={f.q} placeholder="Search by name or sponsor" />
          {f.minUsd !== null ? <input type="hidden" name="minUsd" value={String(f.minUsd)} /> : null}
          {f.within !== null ? <input type="hidden" name="within" value={String(f.within)} /> : null}
          {f.renewable ? <input type="hidden" name="renewable" value="true" /> : null}
          <Button type="submit" variant="soft" size="sm">
            Search
          </Button>
        </form>
      </search>
      <div className={styles.group}>
        <h4>Deadline</h4>
        <div className={styles.chips}>
          <ChipLink href={filterHref(base, f, { within: null })} active={f.within === null}>
            Any time
          </ChipLink>
          {WITHIN_DAYS.map((d) => (
            <ChipLink key={d} href={filterHref(base, f, { within: d })} active={f.within === d}>
              {`Next ${d} days`}
            </ChipLink>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <h4>Amount</h4>
        <div className={styles.chips}>
          <ChipLink href={filterHref(base, f, { minUsd: null })} active={f.minUsd === null}>
            Any amount
          </ChipLink>
          {MIN_AMOUNTS.map((n) => (
            <ChipLink key={n} href={filterHref(base, f, { minUsd: n })} active={f.minUsd === n}>
              {`${usd(n)}+`}
            </ChipLink>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <h4>Type</h4>
        <div className={styles.chips}>
          <ChipLink href={filterHref(base, f, { renewable: !f.renewable })} active={f.renewable}>
            Renewable only
          </ChipLink>
        </div>
      </div>
      <p className={styles.fine}>Listings that charge a fee or look like scams never appear here.</p>
    </Card>
  );
}
