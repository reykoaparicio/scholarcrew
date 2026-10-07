"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { Badge, Button, Icon, type IconName } from "@scholarcrew/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import styles from "./admin.module.css";

type Counts = { tasks: number; reports: number };

const NAV: Array<{ key: string; label: string; href: string; icon: IconName; count?: keyof Counts }> = [
  { key: "tasks", label: "Review queue", href: "/admin/tasks", icon: "check", count: "tasks" },
  { key: "scholarships", label: "Scholarships", href: "/admin/scholarships", icon: "award" },
  { key: "reports", label: "Reports", href: "/admin/reports", icon: "alert", count: "reports" },
  { key: "colleges", label: "Colleges", href: "/admin/colleges", icon: "columns" },
  { key: "aid", label: "Aid rules", href: "/admin/aid", icon: "doc" },
  { key: "audit", label: "Audit log", href: "/admin/audit", icon: "doc" },
];

/** "/admin/scholarships/new" → "scholarships"; "/admin" → "tasks". */
export function adminActiveKey(pathname: string): string {
  const segment = pathname.split("/")[2] ?? "";
  return NAV.some((n) => n.key === segment) ? segment : "tasks";
}

export function AdminFrame({
  user,
  counts,
  children,
}: {
  user: { name: string; email: string };
  counts: Counts;
  children: ReactNode;
}) {
  const active = adminActiveKey(usePathname() ?? "/admin");
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /**
   * R3A-13: leave only when sign-out worked (13 always answers 204 and clears the cookie), or when the
   * session was already gone (`unauthenticated`). Any other failure keeps the admin here with the message,
   * because the session is still live and `/sign-in` would send them straight back in.
   */
  async function signOut() {
    setLeaving(true);
    setSignOutError(null);
    try {
      await api("/auth/sign-out", { method: "POST" });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "unauthenticated")) {
        setSignOutError(errorMessage(e));
        setLeaving(false);
        return;
      }
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className={styles.frame}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.side}>
        <a href="/admin/tasks" className={styles.brand}>
          <span className={styles.mark}>
            <Icon name="spark" />
          </span>
          <span className={styles.word}>scholarcrew</span>
        </a>
        <div className={styles.consoleNote}>
          <Icon name="lock" />
          Admin console
        </div>
        <nav aria-label="Admin">
          <ul className={styles.nav}>
            {NAV.map((item) => {
              const count = item.count ? counts[item.count] : 0;
              const on = item.key === active;
              return (
                <li key={item.key}>
                  <a
                    href={item.href}
                    className={cx(styles.navItem, on && styles.navOn)}
                    aria-current={on ? "page" : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {count > 0 ? <span className={styles.count}>{count}</span> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className={styles.fine}>The catalog has no student data. Only an admin can publish.</p>
        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <div className={styles.meName}>{user.name}</div>
            <div className={styles.meSub}>{`${user.email} · admin`}</div>
          </div>
        </div>
      </aside>
      <div className={styles.mainCol}>
        <header className={styles.top}>
          <Badge tone="navy" icon="lock">
            Admin
          </Badge>
          <span className={styles.spacer} />
          <Button variant="line" size="sm" disabled={leaving} onClick={signOut}>
            Sign out
          </Button>
        </header>
        {signOutError ? (
          <p role="alert" className={styles.alert}>
            {signOutError}
          </p>
        ) : null}
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
