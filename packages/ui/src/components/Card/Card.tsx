import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Card.module.css";

export interface CardProps {
  title?: ReactNode;
  aside?: ReactNode;
  padding?: "md" | "lg";
  className?: string;
  children?: ReactNode;
}

/** White rounded panel. A string title becomes an h2 styled as the mockup card heading. */
export function Card({ title, aside, padding = "md", className, children }: CardProps) {
  const hasHead = title !== undefined || aside !== undefined;
  return (
    <section className={cx(styles.card, styles[padding], className)}>
      {hasHead ? (
        <div className={styles.head}>
          {typeof title === "string" ? <h2 className={styles.title}>{title}</h2> : (title ?? <span />)}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}
