"use client";

import { Button, EmptyState } from "@scholarcrew/ui";
import styles from "./error.module.css";

export function ErrorState({ reset }: { reset: () => void }) {
  return (
    <div className={styles.error}>
      <EmptyState title="Something went wrong on our side" icon="alert">
        <p>This page couldn't load. Nothing you entered was lost. Try again in a moment.</p>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
