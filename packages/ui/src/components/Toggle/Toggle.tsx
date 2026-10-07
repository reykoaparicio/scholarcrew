"use client";

import { type KeyboardEvent, useId } from "react";
import { cx } from "../../shared/cx";
import styles from "./Toggle.module.css";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Muted text before the switch, e.g. "$60k–75k · shared by Dana". */
  detail?: string;
  disabled?: boolean;
  className?: string;
}

/** A settings row: label, optional detail, and a role="switch" button. */
export function Toggle({ checked, onChange, label, detail, disabled = false, className }: ToggleProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  const flip = () => {
    if (!disabled) onChange(!checked);
  };
  // Handle Space/Enter ourselves and cancel the native activation so a key press flips once.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      flip();
    }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") event.preventDefault();
  };
  return (
    <div className={cx(styles.row, className)}>
      <label id={labelId} htmlFor={id} className={styles.label}>
        {label}
      </label>
      {detail ? (
        <span id={detailId} className={styles.detail}>
          {detail}
        </span>
      ) : null}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={detail ? detailId : undefined}
        disabled={disabled}
        className={cx(styles.tog, checked && styles.on)}
        onClick={flip}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      />
    </div>
  );
}
