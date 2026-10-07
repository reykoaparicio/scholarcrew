import { Button, Card, EmptyState } from "@scholarcrew/ui";

/** Parents see this when the student hasn't joined yet or doesn't share this category. */
export function NotShared({ studentName, what }: { studentName: string; what: string }) {
  const title = studentName ? `${studentName} isn't sharing ${what} right now` : `Your student's ${what} show up here`;
  const body = studentName
    ? "They can turn sharing back on from their Family page."
    : "Once you join your student's family, you'll see what they share with you.";
  return (
    <Card padding="lg">
      <EmptyState
        title={title}
        icon="users"
        action={
          <Button variant="soft" href="/family">
            Open Family
          </Button>
        }
      >
        {body}
      </EmptyState>
    </Card>
  );
}
