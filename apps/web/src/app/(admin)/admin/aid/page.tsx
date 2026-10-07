import { AidRulesEditor } from "@/components/admin/AidRulesEditor";
import styles from "@/components/admin/admin.module.css";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listAidDeadlinesForAdmin, listAidRules } from "@scholarcrew/core/admin";
import { currentAwardYear } from "@scholarcrew/core/shared";
import { AwardYear } from "@scholarcrew/domain";

export const dynamic = "force-dynamic";

/** "2027-28" moved by n years: -1 gives "2026-27". */
function shiftAwardYear(year: string, n: number): string {
  const start = Number(year.slice(0, 4)) + n;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** R2P-1: the award year defaults to currentAwardYear(now); `?awardYear=` picks another. */
export default async function AidAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const deps = getDeps();
  const current = currentAwardYear(deps.clock.now());
  const wanted = AwardYear.safeParse(firstParam(await searchParams, "awardYear"));
  const awardYear = wanted.success ? wanted.data : current;
  const [rules, deadlines] = await Promise.all([
    listAidRules(deps, actor, { awardYear }),
    listAidDeadlinesForAdmin(deps, actor, { awardYear }),
  ]);
  const rule = rules.find((r) => r.key === "federal_loan_rates") ?? null;
  const years = [-1, 0, 1].map((n) => shiftAwardYear(current, n));
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Aid rules and deadlines</h1>
          <p className={styles.sub}>
            Loan rates feed the loan payment estimates on award letters. Deadlines feed the Money page and Coming up.
            Check every value against its official source before saving.
          </p>
        </div>
        <div className={styles.chips} aria-label="Award year">
          {years.map((y) => (
            <a
              key={y}
              href={y === current ? "/admin/aid" : `/admin/aid?awardYear=${y}`}
              className={cx(styles.chip, y === awardYear && styles.chipOn)}
              aria-current={y === awardYear ? "page" : undefined}
            >
              {y}
            </a>
          ))}
        </div>
      </div>
      <AidRulesEditor key={awardYear} awardYear={awardYear} rule={rule} deadlines={deadlines} />
    </>
  );
}
