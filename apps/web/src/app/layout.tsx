import "@scholarcrew/ui/tokens.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ScholarCrew",
  description: "A crew of AI specialists that plans scholarships, essays, applications, and the cost of college.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// SE-05: system fonts from tokens.css; no third-party scripts, fonts, or trackers.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce");
  return (
    <html lang="en" data-nonce={nonce ?? undefined}>
      <body>{children}</body>
    </html>
  );
}
