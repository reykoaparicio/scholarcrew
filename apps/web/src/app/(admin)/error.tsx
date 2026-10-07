"use client";

import { ErrorState } from "@/components/public/ErrorState";

/** Renders inside the admin frame. The error itself is never shown. */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
