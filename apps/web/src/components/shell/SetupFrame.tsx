import { cx } from "@/lib/cx";
import { CREW_NAMES, CREW_ROLES } from "@scholarcrew/domain";
import { Button, CrewDot, Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import { navFor } from "./nav";
import styles from "./shell.module.css";

/** Mockup 09 frame: the nav is dimmed and not clickable until setup is done. */
export function SetupFrame({ user, children }: { user: { name: string; subtitle: string }; children: ReactNode }) {
  const initial = user.name.trim().charAt(0).toUpperCase();
  return (
    <div className={styles.setupFrame}>
      <aside className={styles.setupSide}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Icon name="spark" />
          </span>
          <span className={styles.word}>scholarcrew</span>
        </div>
        <div className={styles.setupNote}>
          <Icon name="lock" />
          <span>Opens after setup</span>
        </div>
        <ul className={styles.dim} aria-label="Pages that open after setup">
          {navFor("student").map((item) => (
            <li key={item.key} className={styles.dimItem}>
              <Icon name={item.icon} />
              {item.label}
            </li>
          ))}
        </ul>
        <div className={cx(styles.railSec, styles.dim)}>
          <h2 className={styles.railTitle}>Your crew</h2>
          <ul className={styles.roster}>
            {CREW_ROLES.map((role) => (
              <li key={role}>
                <CrewDot role={role} hollow={role === "prep" || role === "impact"} />
                {CREW_NAMES[role]}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <div>
            <div className={styles.meName}>{user.name}</div>
            <div className={styles.meSub}>{user.subtitle}</div>
          </div>
        </div>
      </aside>
      <div className={styles.setupMain}>
        <header className={styles.setupTop}>
          <b>Setting up your crew</b>
          <span>· about 4 minutes · saved on this device as you go</span>
          <span className={styles.spacer} />
          <Button variant="line" href="/">
            Finish later
          </Button>
        </header>
        <main id="main" className={styles.setupContent}>
          {children}
        </main>
      </div>
    </div>
  );
}
