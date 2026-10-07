import type { SelectHTMLAttributes } from "react";
import { cx } from "../../shared/cx";
import { Field } from "../Field/Field";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "children"> {
  label: string;
  options: SelectOption[];
  /** Adds a first option with value "". */
  placeholder?: string;
  hint?: string;
  error?: string;
  className?: string;
}

export function Select({ label, options, placeholder, hint, error, className, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <select {...rest} {...control} className={cx(styles.select, error && styles.invalid)}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
