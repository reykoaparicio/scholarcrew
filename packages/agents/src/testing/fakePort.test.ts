import { ContextSnapshot } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { JORDAN, createFakePort } from "./fakePort";

describe("createFakePort", () => {
  it("returns Jordan's snapshot for the requested room and audience and records calls", async () => {
    const port = createFakePort();
    const snap = await port.snapshot(JORDAN.ownerId, "family", "family");
    expect(ContextSnapshot.safeParse(snap).success).toBe(true);
    expect(snap).toMatchObject({ ownerId: JORDAN.ownerId, displayName: "Jordan", room: "family", audience: "family" });
    expect(snap.enabledSpecialists).toHaveLength(7);
    expect(port.calls).toEqual(["snapshot:family:family"]);
  });

  it("finds catalog records by id or slug and filters searches by name", async () => {
    const port = createFakePort();
    expect((await port.scholarship(JORDAN.scholarshipId))?.sourceUrl).toBe(JORDAN.scholarshipSourceUrl);
    expect((await port.scholarship("hill-country-stem-award"))?.verifiedAt).toBe(JORDAN.scholarshipVerifiedAt);
    expect(await port.scholarship("missing")).toBeNull();
    expect((await port.college(JORDAN.collegeId))?.name).toBe("The University of Texas at Austin");
    const found = await port.searchScholarships({ q: "stem", page: 1, pageSize: 20 });
    expect(found.map((s) => s.slug)).toEqual(["hill-country-stem-award"]);
    expect(await port.searchScholarships({ q: "rotary", page: 1, pageSize: 20 })).toEqual([]);
  });

  it("takes overrides per field", async () => {
    const port = createFakePort({ stories: [], deadlines: [] });
    expect(await port.stories(JORDAN.ownerId)).toEqual([]);
    expect(await port.deadlines(JORDAN.ownerId)).toEqual([]);
    expect((await port.essay(JORDAN.ownerId, JORDAN.essayId))?.title).toBe("Hill Country STEM essay");
  });
});
