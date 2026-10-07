import { TaskList } from "@/components/admin/TaskList";
import { TaskReview } from "@/components/admin/TaskReview";
import styles from "@/components/admin/admin.module.css";
import { KIND_LABELS, STATUS_LABELS } from "@/components/admin/review";
import { type SearchParams, firstParam } from "@/components/public/params";
import { cx } from "@/lib/cx";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getCatalogTask, getScholarshipForAdmin, listCatalogTasks } from "@scholarcrew/core/admin";
import { currentSeason } from "@scholarcrew/core/shared";
import { CatalogTaskKind, CatalogTaskStatus, isAppError } from "@scholarcrew/domain";
import { EmptyState } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

/** D36: the core getters throw not_found for a bad or unknown id; here that just means "nothing selected". */
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

function href(f: { status: string; kind?: string; task?: string }): string {
  const p = new URLSearchParams();
  if (f.status !== "open") p.set("status", f.status);
  if (f.kind) p.set("kind", f.kind);
  if (f.task) p.set("task", f.task);
  const text = p.toString();
  return text ? `/admin/tasks?${text}` : "/admin/tasks";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const statusParam = firstParam(sp, "status") ?? "open";
  const parsedStatus = CatalogTaskStatus.safeParse(statusParam);
  const status = statusParam === "all" ? undefined : parsedStatus.success ? parsedStatus.data : "open";
  const statusKey = status ?? "all";
  const parsedKind = CatalogTaskKind.safeParse(firstParam(sp, "kind"));
  const kind = parsedKind.success ? parsedKind.data : undefined;

  const deps = getDeps();
  const tasks = await listCatalogTasks(deps, actor, { status, kind });
  const wanted = firstParam(sp, "task") ?? tasks[0]?.id ?? null;
  const selected = wanted
    ? (tasks.find((t) => t.id === wanted) ?? (await orNull(() => getCatalogTask(deps, actor, wanted))))
    : null;
  const listingId = selected?.scholarshipId;
  const existing = listingId ? await orNull(() => getScholarshipForAdmin(deps, actor, listingId)) : null;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Review queue</h1>
          <p className={styles.sub}>
            {`${tasks.length} ${status ? STATUS_LABELS[status].toLowerCase() : "in all"} · research finds candidates, code checks them, a person decides`}
          </p>
        </div>
        <div className={styles.stack}>
          <div className={styles.chips} aria-label="Kind">
            <a href={href({ status: statusKey })} className={cx(styles.chip, !kind && styles.chipOn)}>
              All
            </a>
            {CatalogTaskKind.options.map((k) => (
              <a
                key={k}
                href={href({ status: statusKey, kind: k })}
                className={cx(styles.chip, kind === k && styles.chipOn)}
              >
                {KIND_LABELS[k]}
              </a>
            ))}
          </div>
          <div className={styles.chips} aria-label="Status">
            {[...CatalogTaskStatus.options, "all" as const].map((s) => (
              <a key={s} href={href({ status: s, kind })} className={cx(styles.chip, statusKey === s && styles.chipOn)}>
                {s === "all" ? "All" : STATUS_LABELS[s]}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.grid2}>
        <TaskList
          items={tasks.map((t) => ({ task: t, href: href({ status: statusKey, kind, task: t.id }) }))}
          selectedId={selected?.id ?? null}
        />
        {selected ? (
          <TaskReview
            key={selected.id}
            task={selected}
            existing={existing}
            defaultCycle={currentSeason(deps.clock.now())}
          />
        ) : (
          <EmptyState title="Pick a task" icon="arrow">
            Choose a task on the left to review it.
          </EmptyState>
        )}
      </div>
    </>
  );
}
