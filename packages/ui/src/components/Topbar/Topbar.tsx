import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Topbar.module.css";

export interface TopbarSearch {
  /** Page the GET form submits to, e.g. "/scholarships". */
  action: string;
  placeholder: string;
  name?: string;
  defaultValue?: string;
}

export interface TopbarProps {
  search?: TopbarSearch;
  notifications?: { href: string; unread: number };
  /** Right-side actions, e.g. <Button variant="primary" icon="chat" href="/crew">Ask your crew</Button>. */
  children?: ReactNode;
}

export function Topbar({ search, notifications, children }: TopbarProps) {
  const unread = notifications?.unread ?? 0;
  return (
    <header className={styles.topbar}>
      {search ? (
        <form action={search.action} method="get" className={styles.search}>
          <Icon name="search" />
          <input
            type="search"
            name={search.name ?? "q"}
            placeholder={search.placeholder}
            defaultValue={search.defaultValue}
            aria-label="Search"
            className={styles.searchInput}
          />
        </form>
      ) : null}
      <div className={styles.spacer} />
      {notifications ? (
        <a
          href={notifications.href}
          className={styles.iconBtn}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Icon name="bell" />
          {unread > 0 ? <span className={styles.pip} /> : null}
        </a>
      ) : null}
      {children}
    </header>
  );
}
