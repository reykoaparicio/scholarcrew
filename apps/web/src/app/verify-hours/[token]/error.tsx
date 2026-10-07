"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Token page: renders inside the verify-hours chrome with no student data, token, or error text. */
export default function VerifyHoursError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
