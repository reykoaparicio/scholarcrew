import { describe, expect, it } from "vitest";
import { roomBadge, roomFacts } from "./roomFacts";

describe("roomFacts", () => {
  it("describes My Crew like the mockup", () => {
    expect(roomFacts("my_crew", { parentNames: ["Dana"], title: "My Crew" })).toEqual([
      { label: "Memory", value: "Your private profile and history" },
      { label: "Family", value: "Not shared with Dana" },
      { label: "Can't see", value: "Sensitive facts, your family's documents" },
      { label: "Saves", value: "Only when you click" },
    ]);
    expect(roomFacts("my_crew", { parentNames: [], title: "" })[1]).toEqual({
      label: "Family",
      value: "No family members yet",
    });
    expect(roomFacts("my_crew", { parentNames: ["Dana", "Sam"], title: "" })[1]?.value).toBe(
      "Not shared with Dana and Sam",
    );
  });

  it("says temporary chats load and save nothing (CR-07)", () => {
    const facts = roomFacts("temporary", { parentNames: ["Dana"], title: "Temporary chat" });
    expect(facts.find((f) => f.label === "Memory")?.value).toBe("Nothing from your profile or past chats");
    expect(facts.find((f) => f.label === "Saves")?.value).toBe("Nothing. Deleted after 24 hours");
    expect(roomBadge("temporary")).toEqual({ label: "Temporary · deleted after 24 hours", icon: "clock" });
  });

  it("puts the room's object first in context rooms", () => {
    expect(roomFacts("scholarship", { parentNames: [], title: "Hill Country STEM Award" })[0]).toEqual({
      label: "Focus",
      value: "Hill Country STEM Award",
    });
    expect(roomBadge("my_crew")).toEqual({ label: "Private to you", icon: "lock" });
    expect(roomBadge("family").label).toBe("Shared with family");
  });
});
