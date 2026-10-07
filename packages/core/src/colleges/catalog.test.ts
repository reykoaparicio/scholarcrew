import { factories } from "@scholarcrew/db/testing";
import { type CollegeQuery, PUBLIC_ACTOR } from "@scholarcrew/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { makeStudent, setup } from "../scholarships/testkit";
import { getCollege, searchColleges } from "./catalog";

const Q = (o: Partial<CollegeQuery> = {}): CollegeQuery => ({ page: 1, pageSize: 20, ...o });
let ctx: ReturnType<typeof setup>;
let student: Awaited<ReturnType<typeof makeStudent>>;

beforeEach(async () => {
  ctx = setup();
  student = await makeStudent(ctx.deps);
  const { db } = ctx.deps;
  await factories.college(db, { id: "100001", name: "Maple State University", state: "TX" });
  await factories.college(db, { id: "100002", name: "Cedar College", state: "OK", control: "private_nonprofit" });
  await factories.college(db, { id: "100003", name: "Birch Tech", state: "TX", admitRateX1000: 452 });
});

describe("searchColleges", () => {
  it("filters by name, state, and control, ordered by name", async () => {
    const run = async (o: Partial<CollegeQuery>) =>
      (await searchColleges(ctx.deps, student.actor, Q(o))).items.map((c) => c.name);
    expect(await run({})).toEqual(["Birch Tech", "Cedar College", "Maple State University"]);
    expect(await run({ q: "maple" })).toEqual(["Maple State University"]);
    expect(await run({ state: "tx" })).toEqual(["Birch Tech", "Maple State University"]);
    expect(await run({ control: "private_nonprofit" })).toEqual(["Cedar College"]);
  });

  it("paginates and maps rates to fractions", async () => {
    const page = await searchColleges(ctx.deps, student.actor, Q({ pageSize: 1 }));
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 1 });
    expect(page.items[0]).toMatchObject({ id: "100003", admitRate: 0.452, testPolicy: "optional" });
  });

  it("needs a signed-in user", async () => {
    await expect(searchColleges(ctx.deps, PUBLIC_ACTOR, Q())).rejects.toThrow();
  });
});

describe("getCollege", () => {
  it("returns the full record or not_found", async () => {
    const c = await getCollege(ctx.deps, student.actor, "100001");
    expect(c).toMatchObject({ id: "100001", admitRate: 0.6, deadlines: { RD: "2027-01-15", rolling: false } });
    await expect(getCollege(ctx.deps, student.actor, "999999")).rejects.toMatchObject({ code: "not_found" });
  });
});
