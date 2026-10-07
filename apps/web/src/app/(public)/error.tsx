"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Renders inside the public chrome. The error itself is never shown (Next logs it on the server). */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
