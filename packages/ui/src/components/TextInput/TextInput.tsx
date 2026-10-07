import type { InputHTMLAttributes } from "react";
import { cx } from "../../shared/cx";
import { Field } from "../Field/Field";
import styles from "./TextInput.module.css";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
}

export function TextInput({ label, hint, error, className, type = "text", ...rest }: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => <input {...rest} {...control} type={type} className={cx(styles.input, error && styles.invalid)} />}
    </Field>
  );
}
