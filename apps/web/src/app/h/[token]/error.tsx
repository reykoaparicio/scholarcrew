"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Token page: shows no student data, no token, and nothing from the URL or the error. */
export default function HelperError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main">
      <ErrorState reset={reset} />
    </main>
  );
}
