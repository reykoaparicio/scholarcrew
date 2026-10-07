import { type ReactNode, useId } from "react";
import { cx } from "../../shared/cx";
import { Icon } from "../Icon/Icon";
import styles from "./Field.module.css";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** Spread the props onto the control so the label, hint, and error are linked to it. */
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ");
  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
  };
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children(control)}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          <Icon name="alert" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
