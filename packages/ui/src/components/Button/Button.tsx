import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "../../shared/cx";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./Button.module.css";

export interface ButtonProps {
  variant: "primary" | "soft" | "line" | "white" | "glass";
  size?: "sm" | "md";
  icon?: IconName;
  iconEnd?: IconName;
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}

/** `href` renders a link styled as a button; otherwise a <button> (type defaults to "button"). */
export function Button({
  variant,
  size = "md",
  icon,
  iconEnd,
  href,
  type,
  onClick,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  children,
}: ButtonProps) {
  const classes = cx(styles.btn, styles[variant], size === "sm" && styles.sm, className);
  const content = (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} /> : null}
    </>
  );
  if (href !== undefined && !disabled) {
    return (
      <a href={href} className={classes} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
