import { CREW_NAMES, type CrewRole } from "@scholarcrew/domain";
import type { ReactNode } from "react";
import { CREW_DUTIES } from "../../crewColors";
import a11y from "../../shared/a11y.module.css";
import { cx } from "../../shared/cx";
import { CrewDot } from "../CrewDot/CrewDot";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./AppShell.module.css";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  /** Shown at the right when above zero. */
  count?: number;
}

export interface CrewRosterItem {
  role: CrewRole;
  enabled: boolean;
  /** Defaults to CREW_DUTIES[role]. */
  duty?: string;
  /** Where "add" links for a switched-off member. */
  addHref?: string;
}

export interface AppShellProps {
  nav: NavItem[];
  activeKey: string;
  crew: CrewRosterItem[];
  user: { name: string; subtitle: string };
  topbar: ReactNode;
  children: ReactNode;
  /** Extra class on the outer frame, e.g. "sc-shell". */
  className?: string;
  /**
   * Phone navigation (mockup 19), rendered after the main column. When set, the sidebar hides below
   * 640px and the content leaves 96px at the bottom for a fixed tab bar.
   */
  mobileNav?: ReactNode;
}

function RosterEnd({ member }: { member: CrewRosterItem }) {
  if (member.enabled) return <span className={styles.role}>{member.duty ?? CREW_DUTIES[member.role]}</span>;
  if (member.addHref) {
    return (
      <a href={member.addHref} className={styles.role}>
        add<span className={a11y.srOnly}> {CREW_NAMES[member.role]}</span>
      </a>
    );
  }
  return <span className={styles.role}>add</span>;
}

export function AppShell({ nav, activeKey, crew, user, topbar, children, className, mobileNav }: AppShellProps) {
  const initial = user.name.trim().charAt(0).toUpperCase();
  return (
    <div className={cx(styles.frame, mobileNav ? styles.withMobileNav : null, className)}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Icon name="spark" />
          </span>
          <span className={styles.word}>scholarcrew</span>
        </div>
        <nav aria-label="Main" className={styles.nav}>
          {nav.map((item) => {
            const active = item.key === activeKey;
            return (
              <a
                key={item.key}
                href={item.href}
                className={cx(styles.navItem, active && styles.on)}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.count ? (
                  <>
                    {" "}
                    <span className={styles.count}>{item.count}</span>
                  </>
                ) : null}
              </a>
            );
          })}
        </nav>
        <div className={styles.railSec}>
          <h2 className={styles.railTitle}>Your crew</h2>
          <ul className={styles.roster}>
            {crew.map((member) => (
              <li key={member.role} className={member.enabled ? undefined : styles.off}>
                <CrewDot role={member.role} hollow={!member.enabled} />
                {CREW_NAMES[member.role]}
                <RosterEnd member={member} />
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <div>
            <div className={styles.name}>{user.name}</div>
            <div className={styles.subtitle}>{user.subtitle}</div>
          </div>
        </div>
      </aside>
      <div className={styles.main}>
        {topbar}
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
      {mobileNav}
    </div>
  );
}
