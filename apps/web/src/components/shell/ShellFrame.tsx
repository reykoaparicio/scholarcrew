"use client";

import { cx } from "@/lib/cx";
import { AppShell, type CrewRosterItem, Icon, type NavItem } from "@scholarcrew/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { activeKeyFor } from "./nav";
import styles from "./shell.module.css";

export interface ShellFrameProps {
  nav: NavItem[];
  crew: CrewRosterItem[];
  user: { name: string; subtitle: string };
  topbar: ReactNode;
  tabs: NavItem[];
  more: NavItem[];
  children: ReactNode;
}

export function ShellFrame({ nav, crew, user, topbar, tabs, more, children }: ShellFrameProps) {
  const active = activeKeyFor(usePathname() ?? "/");
  const phoneNav = (
    <nav className={styles.tabs} aria-label="Main on phones">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          className={cx(styles.tab, t.key === active && styles.tabOn)}
          aria-current={t.key === active ? "page" : undefined}
        >
          <Icon name={t.icon} />
          {t.label}
        </a>
      ))}
      <details className={styles.more}>
        <summary className={cx(styles.moreToggle, more.some((m) => m.key === active) && styles.tabOn)}>
          <Icon name="chev" />
          More
        </summary>
        <div className={styles.moreMenu}>
          {more.map((m) => (
            <a key={m.key} href={m.href} aria-current={m.key === active ? "page" : undefined}>
              <Icon name={m.icon} />
              {m.label}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
  return (
    <AppShell
      nav={nav}
      activeKey={active}
      crew={crew}
      user={user}
      topbar={topbar}
      className="sc-shell"
      mobileNav={phoneNav}
    >
      {children}
    </AppShell>
  );
}
