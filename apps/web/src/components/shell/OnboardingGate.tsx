"use client";

import type { Role } from "@scholarcrew/domain";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { onboardingRedirect } from "./nav";
import styles from "./shell.module.css";

/** Client fallback for the onboarding redirect when the layout has no x-pathname header (D30). */
export function OnboardingGate({
  role,
  onboardingComplete,
  children,
}: {
  role: Role;
  onboardingComplete: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const target = onboardingRedirect({ role, onboardingComplete }, pathname);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (target) return <p className={styles.gate}>Taking you to setup…</p>;
  return <>{children}</>;
}
