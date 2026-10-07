import { ensureChecklists } from "@scholarcrew/core/aid";
import { factories } from "@scholarcrew/db/testing";
import { type AidChecklist, type AidChecklistItem, type AidDeadline, systemActor } from "@scholarcrew/domain";
import { NO_PARAMS, params, readJson, request, signedInParent, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as checklists } from "./checklists/route";
import { GET as deadlines } from "./deadlines/route";
import { PATCH as patchItem } from "./items/[id]/route";

const deps = useTestDeps();

async function studentWithParent() {
  const student = await signedInStudent(deps().db);
  const parent = await signedInParent(deps().db);
  await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
  await ensureChecklists(deps(), systemActor("test"), student.user.id);
  return { student, parent };
}

function fafsaItems(lists: AidChecklist[]): AidChecklistItem[] {
  const fafsa = lists.find((l) => l.program === "fafsa");
  if (!fafsa) throw new Error("expected a FAFSA checklist");
  return fafsa.items;
}

describe("aid checklists (AID-01)", () => {
  it("lists the FAFSA steps for the award year and lets the student check one off", async () => {
    const { student } = await studentWithParent();
    const lists = await readJson<AidChecklist[]>(
      await checklists(request("/aid/checklists", { cookie: student.cookie }), NO_PARAMS),
    );
    const items = fafsaItems(lists);
    expect(items).toHaveLength(7);
    expect(items.every((i) => i.awardYear === "2027-28")).toBe(true);
    const mine = items.find((i) => i.assignee === "student");
    if (!mine) throw new Error("expected a student step");
    const path = `/aid/items/${mine.id}`;
    const done = await patchItem(
      request(path, { method: "PATCH", cookie: student.cookie, body: { status: "done" } }),
      params({ id: mine.id }),
    );
    expect(done.status).toBe(200);
    expect((await readJson<AidChecklistItem>(done)).status).toBe("done");
    const bad = await patchItem(
      request(path, { method: "PATCH", cookie: student.cookie, body: { status: "finished" } }),
      params({ id: mine.id }),
    );
    expect(bad.status).toBe(400);
  });

  it("lets a parent read the checklist and complete parent steps; strangers get 404", async () => {
    const { student, parent } = await studentWithParent();
    const path = `/aid/checklists?studentId=${student.user.id}`;
    const lists = await readJson<AidChecklist[]>(await checklists(request(path, { cookie: parent.cookie }), NO_PARAMS));
    const theirs = fafsaItems(lists).find((i) => i.assignee === "parent");
    if (!theirs) throw new Error("expected a parent step");
    const done = await patchItem(
      request(`/aid/items/${theirs.id}`, { method: "PATCH", cookie: parent.cookie, body: { status: "done" } }),
      params({ id: theirs.id }),
    );
    expect(done.status).toBe(200);
    const stranger = await signedInStudent(deps().db);
    expect((await checklists(request(path, { cookie: stranger.cookie }), NO_PARAMS)).status).toBe(404);
    const steal = await patchItem(
      request(`/aid/items/${theirs.id}`, { method: "PATCH", cookie: stranger.cookie, body: { status: "todo" } }),
      params({ id: theirs.id }),
    );
    expect(steal.status).toBe(404);
  });

  it("lists aid deadlines (AID-03)", async () => {
    const { student } = await studentWithParent();
    const res = await deadlines(request("/aid/deadlines", { cookie: student.cookie }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(Array.isArray(await readJson<AidDeadline[]>(res))).toBe(true);
    expect((await deadlines(request("/aid/deadlines"), NO_PARAMS)).status).toBe(401);
  });
});
