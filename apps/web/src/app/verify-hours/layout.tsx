import { PublicChrome, SimpleHeader } from "@/components/public/PublicChrome";
import type { ReactNode } from "react";

export default function VerifyHoursLayout({ children }: { children: ReactNode }) {
  return <PublicChrome header={<SimpleHeader note="Service hours confirmation" />}>{children}</PublicChrome>;
}
