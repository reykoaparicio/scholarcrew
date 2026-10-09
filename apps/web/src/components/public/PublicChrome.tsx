import { Button, Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./public.module.css";

const NAV = [
  { href: "/directory", label: "Directory" },
  { href: "/offer-tool", label: "Offer tool" },
  { href: "/#pricing", label: "Pricing" },
];

export function Brand() {
  return (
    <a href="/" className={styles.brand}>
      <span className={styles.mark}>
        <Icon name="spark" />
      </span>
      <span className={styles.word}>scholarcrew</span>
    </a>
  );
}

export function PublicHeader() {
  return (
    <header className={styles.head}>
      <Brand />
      <nav className={styles.links} aria-label="Site">
        {NAV.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <span className={styles.spacer} />
      <Button variant="line" href="/sign-in">
        Sign in
      </Button>
      <Button variant="primary" href="/sign-in" className={styles.startFree}>
        Start free
      </Button>
    </header>
  );
}

/** Header for pages a visitor reaches from an email link (no account, no site nav). */
export function SimpleHeader({ note }: { note: string }) {
  return (
    <header className={styles.head}>
      <Brand />
      <span className={styles.note}>{note}</span>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className={styles.foot}>
      <span>© 2026 ScholarCrew</span>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/ai-policy">AI use policy</a>
      <a href="/directory">Scholarship directory</a>
      <span className={styles.promise}>
        <Icon name="lock" />
        We never sell student data
      </span>
    </footer>
  );
}

export function PublicChrome({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.page}>
      {header ?? <PublicHeader />}
      <main id="main" className={styles.main}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
