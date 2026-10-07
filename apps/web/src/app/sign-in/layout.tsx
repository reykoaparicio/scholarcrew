import { PublicChrome } from "@/components/public/PublicChrome";
import type { ReactNode } from "react";

export default function SignInLayout({ children }: { children: ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
