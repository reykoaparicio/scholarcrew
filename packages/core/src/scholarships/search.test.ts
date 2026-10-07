import { factories } from "@scholarcrew/db/testing";
import { PUBLIC_ACTOR, type ScholarshipQuery, userActor } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { getScholarship, searchScholarships } from "./search";
import { makeStudent, setup } from "./testkit";

const Q = (o: Partial<ScholarshipQuery> = {}): ScholarshipQuery => ({ page: 1, pageSize: 20, ...o });
const TX = (counties: string[] = []) => ({ national: false, state: "TX" as const, counties, cities: [] });

let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  const { db } = ctx.deps;
  student = await makeStudent(ctx.deps, { state: "TX", county: "Maple" });
  const other = await makeStudent(ctx.deps);
  await factories.scholarship(db, { name: "Alpha National", slug: "alpha-national", deadline: "2026-11-01" });
  await factories.scholarship(db, {
    name: "Bravo Texas",
    localArea: TX(),
    deadline: "2026-10-20",
    renewable: true,
    amountMaxUsd: 5000,
  });
  await factories.scholarship(db, { name: "Charlie Maple", localArea: TX(["Maple"]), deadline: null });
  await factories.scholarship(db, { name: "Delta Cedar", localArea: TX(["Cedar"]) });
  await factories.scholarship(db, { name: "Echo Stale", status: "stale" });
  await factories.scholarship(db, { name: "Flagged One", status: "flagged" });
  await factories.scholarship(db, { name: "Retired One", status: "retired" });
  await factories.scholarship(db, { name: "Draft One", status: "draft" });
  await factories.scholarship(db, {
    name: "Foxtrot Own",
    slug: "foxtrot-own",
    status: "draft",
    visibility: "submitter_only",
    submittedById: student.user.id,
    verifiedAt: null,
    deadline: null,
  });
  await factories.scholarship(db, {
    name: "Other Student Draft",
    slug: "other-draft",
    status: "draft",
    visibility: "submitter_only",
    submittedById: other.user.id,
  });
});

const names = (page: { items: Array<{ name: string }> }) => page.items.map((s) => s.name);

describe("searchScholarships", () => {
  it("shows the public only published public listings, deadline first with nulls last", async () => {
    const page = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q());
    expect(names(page)).toEqual(["Bravo Texas", "Alpha National", "Delta Cedar", "Charlie Maple"]);
    expect(page.total).toBe(4);
  });

  it("adds stale listings and the student's own submissions, never flagged, retired, or others' drafts", async () => {
    const page = await searchScholarships(ctx.deps, student.actor, Q());
    expect(names(page)).toEqual([
      "Bravo Texas",
      "Alpha National",
      "Delta Cedar",
      "Echo Stale",
      "Charlie Maple",
      "Foxtrot Own",
    ]);
    const own = page.items.find((s) => s.name === "Foxtrot Own");
    expect(own?.unverified).toBe(true);
    const maple = page.items.find((s) => s.name === "Charlie Maple");
    expect(maple).toMatchObject({ localLabel: "Maple County, TX", unverified: false });
    expect(page.items.find((s) => s.name === "Bravo Texas")?.localLabel).toBe("Texas");
    expect(page.items.find((s) => s.name === "Alpha National")?.localLabel).toBe("National");
  });

  it("applies text, state, local, renewable, amount, and deadline filters", async () => {
    const run = async (o: Partial<ScholarshipQuery>) => names(await searchScholarships(ctx.deps, student.actor, Q(o)));
    expect(await run({ q: "MAPLE" })).toEqual(["Charlie Maple"]);
    expect(await run({ state: "TX" })).toEqual(["Bravo Texas", "Delta Cedar", "Charlie Maple"]);
    expect(await run({ local: true })).toEqual(["Bravo Texas", "Charlie Maple"]);
    expect(await run({ renewable: true })).toEqual(["Bravo Texas"]);
    expect(await run({ minUsd: 2000 })).toEqual(["Bravo Texas"]);
    expect(await run({ deadlineBefore: "2026-11-01" })).toEqual(["Bravo Texas", "Alpha National"]);
    expect(await run({ q: "100%_" })).toEqual([]);
    await expect(searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ local: true }))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("drops scam-flagged listings in SQL when excludeScams is set, and always for the public", async () => {
    await factories.scholarship(ctx.deps.db, {
      name: "Golf Scam",
      localArea: TX(),
      scamFlags: ["application_fee"],
      deadline: "2026-10-10",
    });
    expect(names(await searchScholarships(ctx.deps, student.actor, Q()))[0]).toBe("Golf Scam");
    const clean = await searchScholarships(ctx.deps, student.actor, Q({ excludeScams: true }));
    expect(names(clean)).not.toContain("Golf Scam");
    expect(clean.total).toBe(6);
    const pub = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ pageSize: 3 }));
    expect(names(pub)).toEqual(["Bravo Texas", "Alpha National", "Delta Cedar"]);
    expect(pub.total).toBe(4);
  });

  it("paginates with a stable total", async () => {
    const page = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ page: 2, pageSize: 3 }));
    expect(names(page)).toEqual(["Charlie Maple"]);
    expect(page).toMatchObject({ page: 2, pageSize: 3, total: 4 });
  });

  it("drops listings whose deadline is before openOn in SQL, keeping same-day and undated ones", async () => {
    await factories.scholarship(ctx.deps.db, { name: "Hotel Past", localArea: TX(), deadline: "2026-09-30" });
    await factories.scholarship(ctx.deps.db, { name: "India Today", deadline: "2026-10-06" });
    const all = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q());
    expect(names(all)[0]).toBe("Hotel Past");
    expect(all.total).toBe(6);
    const open = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ openOn: "2026-10-06" }));
    expect(names(open)).toEqual(["India Today", "Bravo Texas", "Alpha National", "Delta Cedar", "Charlie Maple"]);
    expect(open.total).toBe(5);
    const next30 = await searchScholarships(
      ctx.deps,
      PUBLIC_ACTOR,
      Q({ openOn: "2026-10-06", deadlineBefore: "2026-11-05" }),
    );
    expect(names(next30)).toEqual(["India Today", "Bravo Texas", "Alpha National"]);
    const texas = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ state: "TX", openOn: "2026-10-06" }));
    expect(names(texas)).not.toContain("Hotel Past");
    expect(texas.total).toBe(3);
  });

  it("sorts openOn results by deadline ascending with undated listings last, across pages", async () => {
    await factories.scholarship(ctx.deps.db, { name: "Juliet Late", deadline: "2027-01-15" });
    await factories.scholarship(ctx.deps.db, { name: "Aaron Undated", deadline: null });
    await factories.scholarship(ctx.deps.db, { name: "Kilo Past", deadline: "2026-10-05" });
    const first = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ openOn: "2026-10-06", pageSize: 4 }));
    expect(names(first)).toEqual(["Bravo Texas", "Alpha National", "Delta Cedar", "Juliet Late"]);
    expect(first.total).toBe(6);
    const second = await searchScholarships(ctx.deps, PUBLIC_ACTOR, Q({ openOn: "2026-10-06", page: 2, pageSize: 4 }));
    expect(names(second)).toEqual(["Aaron Undated", "Charlie Maple"]);
    expect(second).toMatchObject({ page: 2, pageSize: 4, total: 6 });
  });
});

describe("getScholarship", () => {
  it("finds by slug or id and marks listings verified more than 30 days ago as stale", async () => {
    const old = await factories.scholarship(ctx.deps.db, {
      name: "Old Verify",
      slug: "old-verify",
      verifiedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const bySlug = await getScholarship(ctx.deps, PUBLIC_ACTOR, "old-verify");
    expect(bySlug).toMatchObject({ id: old.id, stale: true, application: null });
    const fresh = await getScholarship(ctx.deps, student.actor, "alpha-national");
    expect(fresh.stale).toBe(false);
    expect((await getScholarship(ctx.deps, student.actor, fresh.id)).name).toBe("Alpha National");
  });

  it("hides other students' submissions and stale listings from the public as not_found", async () => {
    await expect(getScholarship(ctx.deps, student.actor, "other-draft")).rejects.toMatchObject({ code: "not_found" });
    expect((await getScholarship(ctx.deps, student.actor, "foxtrot-own")).visibility).toBe("submitter_only");
    await expect(getScholarship(ctx.deps, PUBLIC_ACTOR, "foxtrot-own")).rejects.toMatchObject({ code: "not_found" });
    const stale = await factories.scholarship(ctx.deps.db, { slug: "stale-two", status: "stale" });
    await expect(getScholarship(ctx.deps, PUBLIC_ACTOR, stale.slug)).rejects.toMatchObject({ code: "not_found" });
    await expect(getScholarship(ctx.deps, userActor(student.user.id, "student"), "missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("hides scam-flagged listings from the public but shows them, with the flag, to a student (R2P-19)", async () => {
    await factories.scholarship(ctx.deps.db, { name: "Golf Scam", slug: "golf-scam", scamFlags: ["application_fee"] });
    await expect(getScholarship(ctx.deps, PUBLIC_ACTOR, "golf-scam")).rejects.toMatchObject({ code: "not_found" });
    const seen = await getScholarship(ctx.deps, student.actor, "golf-scam");
    expect(seen).toMatchObject({ name: "Golf Scam", scamFlags: ["application_fee"] });
    expect((await getScholarship(ctx.deps, PUBLIC_ACTOR, "alpha-national")).name).toBe("Alpha National");
  });
});
