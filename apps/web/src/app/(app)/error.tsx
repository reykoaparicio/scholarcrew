"use client";

import { Button, Card, EmptyState } from "@scholarcrew/ui";

/** Never shows error.message: it can carry internal details. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="Something went wrong on our side">
      <EmptyState
        title="Your work is saved."
        icon="alert"
        action={
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
        }
      >
        Try again, or come back in a few minutes.
      </EmptyState>
    </Card>
  );
}
