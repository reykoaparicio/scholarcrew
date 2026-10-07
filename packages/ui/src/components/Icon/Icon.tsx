import type { ReactNode } from "react";
import { cx } from "../../shared/cx";
import styles from "./Icon.module.css";

export const ICON_NAMES = [
  "calendar",
  "chat",
  "award",
  "pen",
  "columns",
  "dollar",
  "users",
  "bookmark",
  "search",
  "bell",
  "check",
  "clock",
  "alert",
  "info",
  "arrow",
  "plus",
  "clip",
  "lock",
  "doc",
  "spin",
  "ext",
  "chev",
  "spark",
  "reuse",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const SHAPES: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M9 3.5v4M15 3.5v4" />
    </>
  ),
  chat: (
    <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8.5L6 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M8.8 13.6 7.6 21l4.4-2.5 4.4 2.5-1.2-7.4" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1.1-4.6L15.6 4.9a2.1 2.1 0 0 1 3 3L8.1 18.4z" />
      <path d="M13.6 6.9l3 3" />
    </>
  ),
  columns: (
    <>
      <path d="M3.5 9.5 12 4.5l8.5 5" />
      <path d="M5.5 10.5v7.5M10 10.5v7.5M14 10.5v7.5M18.5 10.5v7.5M3.5 20h17" />
    </>
  ),
  dollar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.7 9.3c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1 2.8.9 2.8 2.2-1.2 2.1-2.8 2.1c-1.3 0-2.3-.5-2.9-1.5M12 6.4v1.5M12 16.3v1.4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9.5" r="2.6" />
      <path d="M15.6 14.4A4.6 4.6 0 0 1 21 18.6" />
    </>
  ),
  bookmark: <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2 21 19.5H3z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  clip: (
    <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 7 20z" />
      <path d="M14 3.5v5h5" />
    </>
  ),
  spin: <circle cx="12" cy="12" r="8" strokeDasharray="36 14" />,
  ext: (
    <>
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 14v5H5V6h5" />
    </>
  ),
  chev: <path d="m6 9 6 6 6-6" />,
  spark: <path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2z" />,
  reuse: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  className?: string;
}

/** Decorative inline icon. Always aria-hidden: put meaning in the text beside it. */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      className={cx(styles.icon, className)}
    >
      {SHAPES[name]}
    </svg>
  );
}
