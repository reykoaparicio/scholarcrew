import { requireAppActor } from "@/lib/pageActor";
import { createConversation, listConversations } from "@scholarcrew/core/crew";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type Conversation, type UserActor, isAppError } from "@scholarcrew/domain";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** A parent's crew chat is the family room; it exists once the family has a student (08 createConversation). */
async function openFamilyRoom(deps: CoreDeps, actor: UserActor, familyId: string | null): Promise<Conversation | null> {
  if (!familyId) return null;
  try {
    return await createConversation(deps, actor, { room: "family", roomRefId: null, familyId, title: "" });
  } catch (e) {
    if (isAppError(e) && (e.code === "invalid_input" || e.code === "not_found")) return null;
    throw e;
  }
}

/** CR-01: opens the student's My Crew room, creating it on first visit. Keeps ?prefill and ?ask. Parents go to the family room. */
export default async function CrewIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const sp = await searchParams;
  const conversations = await listConversations(deps, actor);
  if (me.user.role === "parent") {
    const familyRoom =
      conversations.find((c) => c.room === "family") ?? (await openFamilyRoom(deps, actor, me.family?.id ?? null));
    redirect(familyRoom ? `/crew/${familyRoom.id}` : "/family");
  }
  const mine =
    conversations.find((c) => c.room === "my_crew") ??
    (await createConversation(deps, actor, { room: "my_crew", roomRefId: null, familyId: null, title: "" }));
  const qs = new URLSearchParams();
  for (const key of ["prefill", "ask"]) {
    const value = sp[key];
    if (typeof value === "string" && value.trim()) qs.set(key, value.slice(0, 4000));
  }
  const query = qs.toString();
  redirect(`/crew/${mine.id}${query ? `?${query}` : ""}`);
}
