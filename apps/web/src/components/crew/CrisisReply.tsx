import type { CrewReply } from "@scholarcrew/domain";
import styles from "./crew.module.css";

/** CR-09: the reviewed crisis reply. 988 comes first; no plans, chips, or action cards. */
export function CrisisReply({ reply }: { reply: CrewReply }) {
  return (
    <article className={styles.crisis} aria-label="Support is available">
      <div className={styles.crisisBox}>
        <p className={styles.crisisLead}>
          Call or text <a href="tel:988">988</a>
        </p>
        <p>
          The 988 Suicide & Crisis Lifeline is free, confidential, and open 24 hours a day. You can also chat at
          988lifeline.org.
        </p>
        <p>If you're in immediate danger, call 911.</p>
      </div>
      <p className={styles.replyText}>{reply.text}</p>
    </article>
  );
}
