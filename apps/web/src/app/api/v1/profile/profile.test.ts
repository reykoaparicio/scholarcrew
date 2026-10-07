import { profiles } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { MeResponse, Profile } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  readJson,
  request,
  signIn,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as getMe } from "../me/route";
import { POST as onboard } from "../onboarding/route";
import { GET as getProfile, PATCH as patchProfile } from "./route";

const deps = useTestDeps();

const ONBOARDING = {
  displayName: "Maya",
  birthYear: 2009,
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  gpaUnweighted: 3.72,
  intendedMajors: ["Mechanical engineering"],
  interests: ["robotics"],
};

async function newStudent(): Promise<{ id: string; cookie: string }> {
  const user = await factories.user(deps().db, { role: "student", displayName: "" });
  await deps().db.insert(profiles).values({ userId: user.id });
  return { id: user.id, cookie: await signIn(deps().db, user.id) };
}

describe("GET and PATCH /profile", () => {
  it("returns the signed-in user's profile", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const res = await getProfile(request("/profile", { cookie }), NO_PARAMS);
    expect(res.status).toBe(200);
    const profile = await readJson<Profile>(res);
    expect(profile.userId).toBe(user.id);
    expect(profile.state).toBe("TX");
    expect(profile.gpaUnweighted).toBe(3.72);
  });

  it("updates fields and returns the new profile", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await patchProfile(
      request("/profile", { method: "PATCH", cookie, body: { highSchool: "Lakeside High", gpaUnweighted: 3.9 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await readJson<Profile>(res)).toMatchObject({ highSchool: "Lakeside High", gpaUnweighted: 3.9 });
    const again = await readJson<Profile>(await getProfile(request("/profile", { cookie }), NO_PARAMS));
    expect(again.highSchool).toBe("Lakeside High");
  });

  it("rejects invalid patches with 400 invalid_input", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const patch = (body: unknown) => patchProfile(request("/profile", { method: "PATCH", cookie, body }), NO_PARAMS);
    const gpa = await patch({ gpaUnweighted: 7 });
    expect(gpa.status).toBe(400);
    const error = await errorOf(gpa);
    expect(error.code).toBe("invalid_input");
    expect(Array.isArray(error.details)).toBe(true);
    expect((await patch({ nickname: "M" })).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
  });

  it("refuses a patch from another origin (ID-06)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await patchProfile(
      request("/profile", { method: "PATCH", cookie, origin: "https://evil.example", body: { city: "Austin" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /onboarding", () => {
  it("completes onboarding and queues the first plan and sweep", async () => {
    const { cookie } = await newStudent();
    const res = await onboard(request("/onboarding", { method: "POST", cookie, body: ONBOARDING }), NO_PARAMS);
    expect(res.status).toBe(200);
    const me = await readJson<MeResponse>(res);
    expect(me.onboardingComplete).toBe(true);
    expect(me.profile?.county).toBe("Maple");
    expect(deps().jobs.sent.map((j) => j.name)).toEqual(["plan.weekly", "sweep.student"]);
  });

  it("blocks under-13 users and ends their session (ID-03)", async () => {
    const { cookie } = await newStudent();
    const res = await onboard(
      request("/onboarding", { method: "POST", cookie, body: { ...ONBOARDING, birthYear: 2016 } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(403);
    // R3A-17: the reason tells 16's onboarding page this is the age block, not a failed Origin check.
    expect(await errorOf(res)).toEqual({
      code: "forbidden",
      message: "ScholarCrew is for students 13 and older",
      details: { reason: "underage" },
    });
    expect((await getMe(request("/me", { cookie }), NO_PARAMS)).status).toBe(401);
  });

  it("rejects incomplete answers", async () => {
    const { cookie } = await newStudent();
    const res = await onboard(
      request("/onboarding", { method: "POST", cookie, body: { displayName: "Maya" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(400);
    expect(deps().jobs.sent).toEqual([]);
  });

  it("is for students only", async () => {
    const { cookie } = await signedInParent(deps().db);
    const res = await onboard(request("/onboarding", { method: "POST", cookie, body: ONBOARDING }), NO_PARAMS);
    expect(res.status).toBe(403);
  });
});
