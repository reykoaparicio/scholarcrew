"use client";

import { instantLong } from "@/components/public/dates";
import { ApiError, api, errorMessage } from "@/lib/api";
import { safeHref } from "@/lib/format";
import { type CatalogTask, SCAM_FLAG_TEXT, type Scholarship } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Icon, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";
import { ADMIN_TZ } from "./labels";
import {
  KIND_LABELS,
  REASON_LABELS,
  STATUS_LABELS,
  draftOf,
  fieldRows,
  publishDefaults,
  publishInput,
  reportOf,
  sourceUrlOf,
  taskTitle,
} from "./review";

const CHECK_TEXT = { found: "Found", not_found: "Not on page", none: "Not stated on the page" } as const;

/** Mockup 18: fields beside quotes, code checks, and the decision (only an admin publishes, CA-04). */
export function TaskReview({
  task,
  existing,
  defaultCycle,
}: { task: CatalogTask; existing: Scholarship | null; defaultCycle: string }) {
  const router = useRouter();
  const draft = draftOf(task);
  const report = reportOf(task);
  const before = task.payload.type === "recheck_changed" ? task.payload.before : null;
  const [fields, setFields] = useState(() =>
    draft ? publishDefaults(task, draft, existing, defaultCycle) : { slug: "", cycle: defaultCycle, estMinutes: "60" },
  );
  const [note, setNote] = useState("");
  // A submission's placeholder listing already exists (task.scholarshipId), so its draft Publish PATCHes it (R2C-6).
  const [createdId, setCreatedId] = useState<string | null>(
    existing?.id ?? (task.payload.type === "user_submission" ? task.scholarshipId : null),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // R3A-21: set when the server says the task or report is already closed (409).
  const [closed, setClosed] = useState(false);
  const locked = busy || done !== null || closed;
  const open = task.status === "open" || task.status === "in_review";
  const recheck = task.payload.type === "recheck_changed";
  const source = safeHref(sourceUrlOf(task));

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setErrors([]);
    try {
      setDone(await action());
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        // Another admin closed it, or our earlier resolve landed and its response was lost.
        setErrors([e.message]);
        setClosed(true);
        router.refresh();
        return;
      }
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  const resolveTask = (status: "resolved" | "rejected", publishScholarshipId: string | null) =>
    api<CatalogTask>(`/admin/catalog-tasks/${task.id}/resolve`, {
      body: { status, note: note.trim(), publishScholarshipId },
    });

  function publishDraft() {
    if (!draft) return;
    const plan = publishInput(task, draft, fields, existing);
    if (!plan.ok) {
      setErrors(plan.errors);
      return;
    }
    void run(async () => {
      // Create once; a retry after a failed resolve updates the listing it already created.
      const listing = createdId
        ? await api<Scholarship>(`/admin/scholarships/${createdId}`, {
            method: "PATCH",
            body: { ...plan.input, id: createdId },
          })
        : await api<Scholarship>("/admin/scholarships", { body: plan.input });
      setCreatedId(listing.id);
      await resolveTask("resolved", listing.id);
      return `Published ${listing.name}.`;
    });
  }

  /** Only a submission that extraction hasn't read yet publishes its row as is; with a draft, publishDraft runs. */
  function publishSubmission() {
    const id = task.scholarshipId;
    if (!id) return;
    void run(async () => {
      await resolveTask("resolved", id);
      return `Published ${taskTitle(task)}.`;
    });
  }

  function reject() {
    if (!note.trim()) {
      setErrors(["Add a reason before rejecting."]);
      return;
    }
    void run(async () => {
      await resolveTask("rejected", null);
      return "Rejected.";
    });
  }

  /** R2C-7: rejecting a re-check keeps the listing; core puts a stale listing back to published with a fresh check. */
  function keepListing() {
    void run(async () => {
      await resolveTask("rejected", null);
      return "Kept the current listing.";
    });
  }

  /**
   * R2C-7: retire the listing first, then resolve the task without publishing anything.
   * A retry of the resolve after a lost response gets 409; the item is shown closed.
   */
  function retireListing() {
    const id = task.scholarshipId;
    if (!id) return;
    if (!note.trim()) {
      setErrors(["Add a reason before retiring the listing."]);
      return;
    }
    void run(async () => {
      await api<Scholarship>(`/admin/scholarships/${id}/status`, { body: { status: "retired", note: note.trim() } });
      await resolveTask("resolved", null);
      return "Listing retired.";
    });
  }

  function closeReport(status: "resolved" | "rejected") {
    if (task.payload.type !== "report") return;
    if (!note.trim()) {
      setErrors(["Add a note before closing the report."]);
      return;
    }
    const reportId = task.payload.reportId;
    void run(async () => {
      await api(`/admin/reports/${reportId}/resolve`, { body: { status, note: note.trim() } });
      return status === "resolved" ? "Report resolved." : "Report rejected.";
    });
  }

  const rows = draft ? fieldRows(draft, report, before) : [];
  return (
    <div className={styles.stack}>
      <Card>
        <div className={styles.row}>
          <span className={styles.ttype}>{KIND_LABELS[task.kind]}</span>
          <Badge tone={open ? "neutral" : "good"}>{STATUS_LABELS[task.status]}</Badge>
          {task.kind === "research_candidate" ? (
            <span className={styles.sub}>Not published · students can't see it</span>
          ) : null}
        </div>
        <h2>{taskTitle(task)}</h2>
        <p className={styles.sub}>
          {`Opened ${instantLong(task.createdAt, ADMIN_TZ)}`}
          {source ? (
            <>
              {" · from "}
              <a href={source}>
                {source} <Icon name="ext" />
              </a>
            </>
          ) : null}
        </p>
        {draft ? (
          <table className={styles.fields} aria-label="Extracted fields">
            <thead>
              <tr>
                <th scope="col">Field</th>
                {before ? <th scope="col">Before</th> : null}
                <th scope="col">{before ? "Now" : "Extracted"}</th>
                <th scope="col">Quoted from the page</th>
                <th scope="col">Quote check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.field}
                  className={r.check === "not_found" || r.problem ? styles.bad : r.changed ? styles.changed : undefined}
                >
                  <td>{r.label}</td>
                  {before ? <td>{r.before}</td> : null}
                  <td>
                    {r.value}
                    {r.problem ? <div className={styles.sub}>{r.problem}</div> : null}
                  </td>
                  <td className={styles.quote}>{r.quote ? `"${r.quote}"` : "Not stated on the page"}</td>
                  <td>{CHECK_TEXT[r.check]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {task.payload.type === "research_candidate" && !draft ? (
          <EmptyState title="No draft yet" icon="clock">
            The extractor hasn't produced a listing for this page. Check the issues below or reject the task.
          </EmptyState>
        ) : null}
        {task.payload.type === "user_submission" ? (
          <div className={styles.stack}>
            <p>{task.payload.notes || "No notes from the student."}</p>
            <p className={styles.sub}>Only the student who added it can see it until it's published.</p>
            {draft ? null : (
              <p className={styles.sub}>
                The page hasn't been read yet, so Publish ships the listing as the student entered it. Open the listing
                to fill in the amount, deadline, and rules first.
              </p>
            )}
          </div>
        ) : null}
        {task.payload.type === "report" ? (
          <div className={styles.stack}>
            <p>
              <b>{REASON_LABELS[task.payload.reason]}</b>
            </p>
            <p>{task.payload.details || "No details given."}</p>
          </div>
        ) : null}
        {task.payload.type === "import" ? <p>{task.payload.summary}</p> : null}
        {task.scholarshipId ? (
          <p>
            <a href={`/admin/scholarships/${task.scholarshipId}`}>Open the listing</a>
          </p>
        ) : null}
      </Card>

      {report ? (
        <section className={styles.ruleCard} aria-label="Checks run by code">
          <h3>Checks run by code</h3>
          <ul className={styles.checkList}>
            {report.issues.map((i) => (
              <li key={`${i.code}:${i.field ?? ""}:${i.message}`}>
                <Icon name="alert" /> <span>{i.message}</span>
              </li>
            ))}
            {report.scamFlags.map((f) => (
              <li key={f}>
                <Icon name="alert" /> <span>{SCAM_FLAG_TEXT[f]}</span>
              </li>
            ))}
            {report.issues.length === 0 && report.scamFlags.length === 0 ? (
              <li>
                <Icon name="check" /> <span>Required fields present · amount in a normal range · quotes found</span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <Card title="Decision">
        {errors.length > 0 ? (
          <div role="alert" className={styles.alert}>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {done ? <output className={styles.ok}>{done}</output> : null}
        {!open ? (
          <p className={styles.sub}>
            {`${STATUS_LABELS[task.status]}${task.resolvedAt ? ` ${instantLong(task.resolvedAt, ADMIN_TZ)}` : ""}. ${task.resolutionNote}`}
          </p>
        ) : (
          <>
            {draft ? (
              <div className={styles.formGrid}>
                <TextInput
                  label="Slug"
                  value={fields.slug}
                  onChange={(e) => setFields({ ...fields, slug: e.target.value })}
                />
                <TextInput
                  label="Cycle"
                  value={fields.cycle}
                  onChange={(e) => setFields({ ...fields, cycle: e.target.value })}
                />
                <TextInput
                  label="Minutes to apply"
                  inputMode="numeric"
                  value={fields.estMinutes}
                  onChange={(e) => setFields({ ...fields, estMinutes: e.target.value })}
                />
              </div>
            ) : null}
            <TextArea
              label="Decision note"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className={styles.row}>
              {task.payload.type === "report" ? (
                <>
                  <Button variant="primary" size="sm" disabled={locked} onClick={() => closeReport("resolved")}>
                    Resolve report
                  </Button>
                  <Button variant="line" size="sm" disabled={locked} onClick={() => closeReport("rejected")}>
                    Reject report
                  </Button>
                </>
              ) : (
                <>
                  {draft ? (
                    <Button variant="primary" size="sm" disabled={locked} onClick={publishDraft}>
                      Publish
                    </Button>
                  ) : null}
                  {task.payload.type === "user_submission" && !draft ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={locked || !task.scholarshipId}
                      onClick={publishSubmission}
                    >
                      Publish
                    </Button>
                  ) : null}
                  {recheck ? (
                    <>
                      <Button variant="line" size="sm" disabled={locked} onClick={keepListing}>
                        Keep current listing
                      </Button>
                      <Button variant="line" size="sm" disabled={locked || !task.scholarshipId} onClick={retireListing}>
                        Retire listing
                      </Button>
                    </>
                  ) : (
                    <Button variant="line" size="sm" disabled={locked} onClick={reject}>
                      Reject
                    </Button>
                  )}
                </>
              )}
            </div>
            <p className={styles.sub}>
              {recheck
                ? "Publishing or keeping the current listing records you and today's date as the verifier."
                : "Publishing records you and today's date as the verifier."}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
