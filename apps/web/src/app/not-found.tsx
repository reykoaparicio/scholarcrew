import { Button, EmptyState } from "@scholarcrew/ui";

export default function NotFound() {
  return (
    <main className="sc-notfound">
      <div>
        <EmptyState
          title="We couldn't find that page"
          icon="search"
          action={
            <Button variant="primary" href="/week">
              Go to This week
            </Button>
          }
        >
          It may have moved, or it isn't shared with you.
        </EmptyState>
      </div>
    </main>
  );
}
