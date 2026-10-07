import type { EssayComment } from "@scholarcrew/domain";
import styles from "./essays.module.css";
import { highlightSegments } from "./text";

/** ES-04: the saved draft with each comment's exact quote highlighted and numbered. */
export function ReviewView({
  body,
  comments,
  currentVersion,
}: { body: string; comments: EssayComment[]; currentVersion: number }) {
  const stale = comments.filter((comment) => comment.version !== currentVersion);
  const { segments, unplaced } = highlightSegments(
    body,
    comments.filter((comment) => comment.version === currentVersion),
  );
  return (
    <>
      <div className={styles.page} aria-label="Your draft with Quill's notes">
        {segments.map((s) =>
          s.n === null ? (
            <span key={s.start}>{s.text}</span>
          ) : (
            <mark key={s.start} className={styles.mark}>
              {s.text}
              <sup className={styles.num}>{s.n}</sup>
            </mark>
          ),
        )}
      </div>
      {stale.map((comment) => (
        <p key={comment.id} className={styles.footnote}>{`From draft ${comment.version}: ${comment.quote}`}</p>
      ))}
      {unplaced.length > 0 ? (
        <p className={styles.footnote}>
          {unplaced.length === 1
            ? "1 comment points at text that changed since Quill read it."
            : `${unplaced.length} comments point at text that changed since Quill read it.`}
        </p>
      ) : null}
    </>
  );
}
