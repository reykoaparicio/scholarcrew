import { createCandidate } from "@scholarcrew/core/memory";
import { factories } from "@scholarcrew/db/testing";
import { type Decision, type MemoryFact, type SensitiveFactSummary, systemActor } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  params,
  readJson,
  request,
  signIn,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { DELETE as deleteDecision } from "../decisions/[id]/route";
import { GET as listDecisions, POST as recordDecision } from "../decisions/route";
import { GET as listSensitive, PUT as setSensitive } from "../sensitive-facts/route";
import { POST as shareIncome } from "../sensitive-facts/share-income/route";
import { POST as confirmFact } from "./[id]/confirm/route";
import { POST as rejectFact } from "./[id]/reject/route";
import { DELETE as forgetFact, PATCH as patchFact } from "./[id]/route";
import { POST as createFact, GET as listFacts } from "./route";

const deps = useTestDeps();
const SYSTEM = systemActor("test");

async function facts(cookie: string): Promise<MemoryFact[]> {
  return readJson<MemoryFact[]>(await listFacts(request("/facts", { cookie }), NO_PARAMS));
}

async function familyOfTwo() {
  const student = await signedInStudent(deps().db);
  const parent = await signedInParent(deps().db);
  await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
  return { student, parent };
}

describe("facts", () => {
  it("creates, lists, edits, and forgets a fact", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const created = await createFact(
      request("/facts", { method: "POST", cookie, body: { key: "intended_major", value: "mechanical engineering" } }),
      NO_PARAMS,
    );
    expect(created.status).toBe(201);
    const fact = await readJson<MemoryFact>(created);
    expect(fact).toMatchObject({
      key: "intended_major",
      status: "confirmed",
      visibility: "crew",
      source: "user_stated",
    });
    expect(await facts(cookie)).toHaveLength(1);

    const edited = await patchFact(
      request(`/facts/${fact.id}`, { method: "PATCH", cookie, body: { value: "civil engineering" } }),
      params({ id: fact.id }),
    );
    expect(edited.status).toBe(200);
    const next = await readJson<MemoryFact>(edited);
    expect(next.id).not.toBe(fact.id);
    expect((await facts(cookie)).map((f) => f.value)).toEqual(["civil engineering"]);

    const forgotten = await forgetFact(
      request(`/facts/${next.id}`, { method: "DELETE", cookie }),
      params({ id: next.id }),
    );
    expect(forgotten.status).toBe(204);
    expect(await facts(cookie)).toEqual([]);
  });

  it("rejects bad keys and patches", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const bad = await createFact(
      request("/facts", { method: "POST", cookie, body: { key: "Intended Major", value: "x" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
    const fact = await readJson<MemoryFact>(
      await createFact(
        request("/facts", { method: "POST", cookie, body: { key: "dream_school", value: "Rice" } }),
        NO_PARAMS,
      ),
    );
    const patch = await patchFact(
      request(`/facts/${fact.id}`, { method: "PATCH", cookie, body: { visibility: "everyone" } }),
      params({ id: fact.id }),
    );
    expect(patch.status).toBe(400);
  });

  it("keeps facts private to their owner", async () => {
    const { student, parent } = await familyOfTwo();
    const other = await signedInStudent(deps().db);
    const fact = await readJson<MemoryFact>(
      await createFact(
        request("/facts", { method: "POST", cookie: student.cookie, body: { key: "dream_school", value: "Rice" } }),
        NO_PARAMS,
      ),
    );
    const id = params({ id: fact.id });
    const patch = request(`/facts/${fact.id}`, { method: "PATCH", cookie: other.cookie, body: { value: "UT" } });
    expect((await patchFact(patch, id)).status).toBe(404);
    expect(
      (await forgetFact(request(`/facts/${fact.id}`, { method: "DELETE", cookie: other.cookie }), id)).status,
    ).toBe(404);
    expect(await facts(parent.cookie)).toEqual([]);
    expect(await facts(student.cookie)).toHaveLength(1);
  });

  it("confirms and rejects crew candidates", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const input = { visibility: "crew" as const, source: "crew_inferred" as const, sourceRef: null };
    const keep = await createCandidate(deps(), SYSTEM, user.id, {
      key: "favorite_subject",
      value: "chemistry",
      ...input,
    });
    const drop = await createCandidate(deps(), SYSTEM, user.id, { key: "sport", value: "chess", ...input });
    const confirmed = await confirmFact(
      request(`/facts/${keep.id}/confirm`, { method: "POST", cookie }),
      params({ id: keep.id }),
    );
    expect((await readJson<MemoryFact>(confirmed)).status).toBe("confirmed");
    const rejected = await rejectFact(
      request(`/facts/${drop.id}/reject`, { method: "POST", cookie }),
      params({ id: drop.id }),
    );
    expect((await readJson<MemoryFact>(rejected)).status).toBe("rejected");
    expect((await facts(cookie)).map((f) => f.key)).toEqual(["favorite_subject"]);
  });
});

describe("decisions", () => {
  it("records, lists, and deletes decisions; others get 404", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const res = await recordDecision(
      request("/decisions", { method: "POST", cookie, body: { summary: "Apply ED to Rice" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(201);
    const decision = await readJson<Decision>(res);
    expect(decision.rationale).toBe("");
    expect(await readJson<Decision[]>(await listDecisions(request("/decisions", { cookie }), NO_PARAMS))).toHaveLength(
      1,
    );
    const id = params({ id: decision.id });
    expect(
      (await deleteDecision(request(`/decisions/${decision.id}`, { method: "DELETE", cookie: other.cookie }), id))
        .status,
    ).toBe(404);
    expect((await deleteDecision(request(`/decisions/${decision.id}`, { method: "DELETE", cookie }), id)).status).toBe(
      204,
    );
    expect(await readJson<Decision[]>(await listDecisions(request("/decisions", { cookie }), NO_PARAMS))).toEqual([]);
  });
});

describe("sensitive facts", () => {
  it("stores opt-ins and returns owner summaries for all eight kinds", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const put = (body: unknown) =>
      setSensitive(request("/sensitive-facts", { method: "PUT", cookie, body }), NO_PARAMS);
    const res = await put({ kind: "first_gen", enabled: true });
    expect(res.status).toBe(200);
    expect(await readJson<SensitiveFactSummary>(res)).toMatchObject({
      kind: "first_gen",
      enabled: true,
      hasValue: false,
    });
    expect((await put({ kind: "first_gen", enabled: true, value: ["x"] })).status).toBe(400);
    const all = await readJson<SensitiveFactSummary[]>(
      await listSensitive(request("/sensitive-facts", { cookie }), NO_PARAMS),
    );
    expect(all).toHaveLength(8);
    expect(all.find((s) => s.kind === "first_gen")?.enabled).toBe(true);
  });

  it("never shows a student's opt-ins to a parent; a parent can share an income range in", async () => {
    const { student, parent } = await familyOfTwo();
    await setSensitive(
      request("/sensitive-facts", {
        method: "PUT",
        cookie: student.cookie,
        body: { kind: "first_gen", enabled: true },
      }),
      NO_PARAMS,
    );
    const parentView = await readJson<SensitiveFactSummary[]>(
      await listSensitive(request("/sensitive-facts", { cookie: parent.cookie }), NO_PARAMS),
    );
    expect(parentView.every((s) => !s.enabled)).toBe(true);

    const share = (cookie: string) =>
      shareIncome(
        request("/sensitive-facts/share-income", {
          method: "POST",
          cookie,
          body: { studentId: student.user.id, range: "48_75k" },
        }),
        NO_PARAMS,
      );
    expect((await share(parent.cookie)).status).toBe(204);
    const studentView = await readJson<SensitiveFactSummary[]>(
      await listSensitive(request("/sensitive-facts", { cookie: student.cookie }), NO_PARAMS),
    );
    expect(studentView.find((s) => s.kind === "income_range")).toMatchObject({ enabled: false, sharedByParent: true });

    const stranger = await factories.parent(deps().db);
    expect((await share(await signIn(deps().db, stranger.id))).status).toBe(404);
  });
});
