import { requirePageActor } from "@/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requirePageActor(["admin"]);
  redirect("/admin/tasks");
}
