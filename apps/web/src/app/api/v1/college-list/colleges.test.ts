import { setDepsForTests } from "@/server/deps";
import { TEST_NOW, fixedClock } from "@scholarcrew/core/shared";
import { and, collegeList, eq, rateLimits, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  ApplicationItem,
  College,
  CollegeListEntry,
  CollegeSummary,
  Page,
  RecRequest,
  Recommender,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { PATCH as patchItem } from "../application-items/[id]/route";
import { GET as getCollege } from "../colleges/[id]/route";
import { GET as searchColleges } from "../colleges/route";
import { PATCH as patchRec } from "../recommendations/[id]/route";
import { GET as listRecRequests } from "../recommendations/route";
import { POST as requestRec } from "../recommenders/requests/route";
import { POST as addRecommender, GET as listRecommenders } from "../recommenders/route";
import { GET as listItems } from "./[id]/items/route";
import { PATCH as patchEntry, DELETE as removeEntry } from "./[id]/route";
import { POST as archiveSeason } from "./archive-season/route";
import { POST as addCollege, GET as getList } from "./route";

const deps = useTestDeps();

function addToList(cookie: string, collegeId: string): Promise<Response> {
  const body = { collegeId, fit: "target", plan: "RD" };
  return addCollege(request("/college-list", { method: "POST", cookie, body }), NO_PARAMS);
}

describe("GET /colleges", () => {
  it("searches the catalog and reads one college (CO-01)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const maple = await factories.college(deps().db, { name: "Maple State University", state: "TX" });
    await factories.college(deps().db, { name: "Cedar College", state: "OK" });
    const res = await searchColleges(request("/colleges?q=maple&state=TX", { cookie }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect((await readJson<Page<CollegeSummary>>(res)).items.map((c) => c.id)).toEqual([maple.id]);
    const one = await getCollege(request(`/colleges/${maple.id}`, { cookie }), params({ id: maple.id }));
    expect((await readJson<College>(one)).name).toBe("Maple State University");
    expect((await getCollege(request("/colleges/999999", { cookie }), params({ id: "999999" }))).status).toBe(404);
  });

  it("needs a session and valid params", async () => {
    expect((await searchColleges(request("/colleges"), NO_PARAMS)).status).toBe(401);
    const { cookie } = await signedInStudent(deps().db);
    expect((await searchColleges(request("/colleges?control=castle", { cookie }), NO_PARAMS)).status).toBe(400);
  });
});

describe("college list", () => {
  it("adds, reads, updates, and removes entries (CO-02)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const college = await factories.college(deps().db);
    const added = await addToList(cookie, college.id);
    expect(added.status).toBe(201);
    const entry = await readJson<CollegeListEntry>(added);
    expect(entry).toMatchObject({ collegeId: college.id, fit: "target", plan: "RD", season: "2026-27" });
    const list = await readJson<CollegeListEntry[]>(await getList(request("/college-list", { cookie }), NO_PARAMS));
    expect(list.map((e) => e.id)).toEqual([entry.id]);

    const path = `/college-list/${entry.id}`;
    const id = params({ id: entry.id });
    const patched = await patchEntry(request(path, { method: "PATCH", cookie, body: { status: "applying" } }), id);
    expect((await readJson<CollegeListEntry>(patched)).status).toBe("applying");
    expect((await patchEntry(request(path, { method: "PATCH", cookie, body: { fit: "dream" } }), id)).status).toBe(400);
    const other = await signedInStudent(deps().db);
    const body = { status: "withdrawn" };
    expect((await patchEntry(request(path, { method: "PATCH", cookie: other.cookie, body }), id)).status).toBe(404);
    expect((await removeEntry(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await removeEntry(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
  });

  it("refuses a 26th college with the core message (D5)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    for (let n = 0; n < 25; n += 1) {
      const c = await factories.college(deps().db);
      await deps()
        .db.insert(collegeList)
        .values({ ownerId: user.id, collegeId: c.id, fit: "target", plan: "RD", season: "2026-27" });
    }
    const res = await addToList(cookie, (await factories.college(deps().db)).id);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      code: "invalid_input",
      message: "Your list holds up to 25 colleges. Remove one to add another.",
    });
  });

  it("lets a parent read a shared list and hides it when colleges sharing is off", async () => {
    const student = await signedInStudent(deps().db);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    await addToList(student.cookie, (await factories.college(deps().db)).id);
    const path = `/college-list?studentId=${student.user.id}`;
    const shared = await getList(request(path, { cookie: parent.cookie }), NO_PARAMS);
    expect(await readJson<CollegeListEntry[]>(shared)).toHaveLength(1);
    await deps()
      .db.update(shareSettings)
      .set({ enabled: false })
      .where(and(eq(shareSettings.studentId, student.user.id), eq(shareSettings.category, "colleges")));
    expect((await getList(request(path, { cookie: parent.cookie }), NO_PARAMS)).status).toBe(404);
  });

  it("lists and updates application items, then archives the season (CO-03)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const entry = await readJson<CollegeListEntry>(await addToList(cookie, (await factories.college(deps().db)).id));
    const itemsPath = `/college-list/${entry.id}/items`;
    const items = await readJson<ApplicationItem[]>(
      await listItems(request(itemsPath, { cookie }), params({ id: entry.id })),
    );
    const item = items[0];
    if (!item) throw new Error("expected generated application items");
    const path = `/application-items/${item.id}`;
    const id = params({ id: item.id });
    const done = await patchItem(request(path, { method: "PATCH", cookie, body: { status: "done" } }), id);
    expect((await readJson<ApplicationItem>(done)).status).toBe("done");
    expect((await patchItem(request(path, { method: "PATCH", cookie, body: { status: "finished" } }), id)).status).toBe(
      400,
    );
    const other = await signedInStudent(deps().db);
    expect(
      (await patchItem(request(path, { method: "PATCH", cookie: other.cookie, body: { status: "todo" } }), id)).status,
    ).toBe(404);
    expect((await listItems(request(itemsPath, { cookie: other.cookie }), params({ id: entry.id }))).status).toBe(404);
    const archived = await archiveSeason(
      request("/college-list/archive-season", { method: "POST", cookie }),
      NO_PARAMS,
    );
    expect(await readJson(archived)).toEqual({ archived: 1 });
  });
});

describe("recommenders", () => {
  it("adds a recommender and sends a request (CO-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { name: "Ms. Ortiz", email: "ortiz@school.example", relationship: "Chemistry teacher" };
    const res = await addRecommender(request("/recommenders", { method: "POST", cookie, body: input }), NO_PARAMS);
    expect(res.status).toBe(201);
    const rec = await readJson<Recommender>(res);
    const list = await readJson<Recommender[]>(await listRecommenders(request("/recommenders", { cookie }), NO_PARAMS));
    expect(list.map((r) => r.id)).toEqual([rec.id]);
    const ask = (c: string) =>
      requestRec(
        request("/recommenders/requests", { method: "POST", cookie: c, body: { recommenderId: rec.id } }),
        NO_PARAMS,
      );
    const sent = await ask(cookie);
    expect(sent.status).toBe(201);
    expect((await readJson<RecRequest>(sent)).recommenderId).toBe(rec.id);
    const bad = await addRecommender(
      request("/recommenders", { method: "POST", cookie, body: { name: "X", email: "nope" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await ask(other.cookie)).status).toBe(404);
  });

  it("lists the student's recommendation requests newest first, with the helper link id (D33)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const add = async (name: string, email: string) =>
      readJson<Recommender>(
        await addRecommender(
          request("/recommenders", { method: "POST", cookie, body: { name, email, relationship: "Teacher" } }),
          NO_PARAMS,
        ),
      );
    const ask = async (recommenderId: string) =>
      readJson<RecRequest>(
        await requestRec(
          request("/recommenders/requests", { method: "POST", cookie, body: { recommenderId } }),
          NO_PARAMS,
        ),
      );
    const older = await ask((await add("Ms. Ortiz", "ortiz@school.example")).id);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-10-06T16:00:00.000Z") });
    const newer = await ask((await add("Mr. Lee", "lee@school.example")).id);
    const list = await readJson<RecRequest[]>(
      await listRecRequests(request("/recommendations", { cookie }), NO_PARAMS),
    );
    expect(list.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(list[0]?.helperLinkId).toEqual(expect.any(String));
    const other = await signedInStudent(deps().db);
    expect(
      await readJson<RecRequest[]>(
        await listRecRequests(request("/recommendations", { cookie: other.cookie }), NO_PARAMS),
      ),
    ).toEqual([]);
    expect((await listRecRequests(request("/recommendations"), NO_PARAMS)).status).toBe(401);
  });

  it("moves a request to agreed, submitted, or declined for its owner only (R2P-11, CO-07)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const input = { name: "Ms. Ortiz", email: "ortiz@school.example", relationship: "Chemistry teacher" };
    const rec = await readJson<Recommender>(
      await addRecommender(request("/recommenders", { method: "POST", cookie, body: input }), NO_PARAMS),
    );
    const asked = await readJson<RecRequest>(
      await requestRec(
        request("/recommenders/requests", { method: "POST", cookie, body: { recommenderId: rec.id } }),
        NO_PARAMS,
      ),
    );
    const path = `/recommendations/${asked.id}`;
    const id = params({ id: asked.id });
    const patch = (c: string | undefined, body: unknown) =>
      patchRec(request(path, { method: "PATCH", cookie: c, body }), id);
    const agreed = await patch(cookie, { status: "confirmed" });
    expect(agreed.status).toBe(200);
    expect(await readJson<RecRequest>(agreed)).toMatchObject({ id: asked.id, status: "confirmed" });
    expect((await readJson<RecRequest>(await patch(cookie, { status: "submitted" }))).status).toBe("submitted");
    expect((await patch(cookie, { status: "requested" })).status).toBe(400);
    expect((await patch(cookie, {})).status).toBe(400);
    const other = await signedInStudent(deps().db);
    expect((await patch(other.cookie, { status: "declined" })).status).toBe(404);
    expect((await patch(undefined, { status: "declined" })).status).toBe(401);
    const list = await readJson<RecRequest[]>(
      await listRecRequests(request("/recommendations", { cookie }), NO_PARAMS),
    );
    expect(list.map((r) => r.status)).toEqual(["submitted"]);
  });
  it("refuses an eleventh recommendation email in a day", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    await deps()
      .db.insert(rateLimits)
      .values({ key: `recommenders.request:${user.id}`, windowStart: new Date(TEST_NOW), count: 10 });
    const res = await requestRec(request("/recommenders/requests", { method: "POST", cookie, body: {} }), NO_PARAMS);
    expect(res.status).toBe(429);
  });
});
