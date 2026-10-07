import { Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <article className={styles.doc}>
      <p className={styles.draft} role="note">
        <Icon name="alert" />
        <span>
          <b>Draft — needs legal review.</b> This is a plain-language draft. A lawyer hasn't reviewed it yet, and it may
          change before launch.
        </span>
      </p>
      <h1>{title}</h1>
      <p className={styles.updated}>Last updated {updated}</p>
      <p className={styles.intro}>{intro}</p>
      <nav aria-label="On this page" className={styles.toc}>
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
          <h2 id={`${s.id}-h`}>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </article>
  );
}
