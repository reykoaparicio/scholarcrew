import type { RoomKind } from "@scholarcrew/domain";
import type { IconName } from "@scholarcrew/ui";

export const ROOM_TITLES: Record<RoomKind, string> = {
  my_crew: "My Crew",
  family: "Family room",
  temporary: "Temporary chat",
  scholarship: "Scholarship room",
  college: "College room",
  essay: "Essay room",
};

function familyLine(parentNames: string[]): string {
  return parentNames.length > 0 ? `Not shared with ${parentNames.join(" and ")}` : "No family members yet";
}

/** The "In this room" privacy facts for the Crew side panel. */
export function roomFacts(
  room: RoomKind,
  ctx: { parentNames: string[]; title: string },
): Array<{ label: string; value: string }> {
  const cantSee = { label: "Can't see", value: "Sensitive facts, your family's documents" };
  const saves = { label: "Saves", value: "Only when you click" };
  if (room === "temporary") {
    return [
      { label: "Memory", value: "Nothing from your profile or past chats" },
      { label: "Family", value: "Not shared" },
      { label: "Can't see", value: "Saved facts, sensitive facts" },
      { label: "Saves", value: "Nothing. Deleted after 24 hours" },
    ];
  }
  if (room === "family") {
    return [
      { label: "Memory", value: "Only what you've both shared" },
      { label: "Family", value: "Everyone in your family room" },
      { label: "Can't see", value: "Private chats, unshared items, sensitive facts" },
      saves,
    ];
  }
  if (room === "my_crew") {
    return [
      { label: "Memory", value: "Your private profile and history" },
      { label: "Family", value: familyLine(ctx.parentNames) },
      cantSee,
      saves,
    ];
  }
  return [
    { label: "Focus", value: ctx.title || ROOM_TITLES[room] },
    { label: "Memory", value: "Your private profile and history" },
    { label: "Family", value: familyLine(ctx.parentNames) },
    cantSee,
    saves,
  ];
}

export function roomBadge(room: RoomKind): { label: string; icon: IconName } {
  if (room === "temporary") return { label: "Temporary · deleted after 24 hours", icon: "clock" };
  if (room === "family") return { label: "Shared with family", icon: "users" };
  return { label: "Private to you", icon: "lock" };
}
