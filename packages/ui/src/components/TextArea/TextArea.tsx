import type { TextareaHTMLAttributes } from "react";
import { cx } from "../../shared/cx";
import { Field } from "../Field/Field";
import styles from "./TextArea.module.css";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className"> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
}

export function TextArea({ label, hint, error, className, rows = 4, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <textarea {...rest} {...control} rows={rows} className={cx(styles.textarea, error && styles.invalid)} />
      )}
    </Field>
  );
}
