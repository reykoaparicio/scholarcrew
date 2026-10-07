import { AdminFrame } from "@/components/admin/AdminFrame";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { listCatalogTasks, listReports } from "@scholarcrew/core/admin";
import { getMe } from "@scholarcrew/core/profile";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin · ScholarCrew", robots: { index: false, follow: false } };

/** ID-04: signed out → /sign-in; anyone but an admin → the 404 page. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor(["admin"]);
  const deps = getDeps();
  const [me, tasks, reports] = await Promise.all([
    getMe(deps, actor),
    listCatalogTasks(deps, actor, { status: "open" }),
    listReports(deps, actor, "open"),
  ]);
  return (
    <AdminFrame
      user={{ name: me.user.displayName || me.user.email, email: me.user.email }}
      counts={{ tasks: tasks.length, reports: reports.length }}
    >
      {children}
    </AdminFrame>
  );
}
