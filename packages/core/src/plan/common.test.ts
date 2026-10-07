import { describe, expect, it } from "vitest";
import { addIsoDays, firstName, isParentOf, mondayOf, parentsOf, planDeadline, userTimeZone } from "./common";
import { makeDeps, makeParentOf, makeStudent } from "./testkit";

describe("calendar helpers", () => {
  // `todayIn` is 06's shared copy and `formatUsd` is 04's (R3V-9, R3V-5); their tests live there.
  it("adds days and finds Mondays", () => {
    expect(addIsoDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addIsoDays("2026-10-06", -6)).toBe("2026-09-30");
    expect(mondayOf("2026-10-14")).toBe("2026-10-12");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
  });

  it("reads plan deadlines and first names", () => {
    const deadlines = { ED: null, EA: "2026-11-01", REA: null, RD: "2027-01-15", rolling: false };
    expect(planDeadline(deadlines, "EA")).toBe("2026-11-01");
    expect(planDeadline(deadlines, "ED")).toBeNull();
    expect(planDeadline(deadlines, "rolling")).toBeNull();
    expect(firstName("Jordan Reyes")).toBe("Jordan");
    expect(firstName("  ")).toBe("there");
  });
});

describe("family lookups", () => {
  it("finds the student's parents and time zone", async () => {
    const { deps } = makeDeps();
    const { user } = await makeStudent(deps);
    const { parent, family } = await makeParentOf(deps, user.id);
    const { user: other } = await makeStudent(deps);
    expect(await parentsOf(deps.db, user.id)).toEqual([{ familyId: family.id, userId: parent.id }]);
    expect(await parentsOf(deps.db, other.id)).toEqual([]);
    expect(await isParentOf(deps.db, parent.id, user.id)).toBe(true);
    expect(await isParentOf(deps.db, parent.id, other.id)).toBe(false);
    expect(await userTimeZone(deps.db, user.id)).toBe("America/Chicago");
  });
});
