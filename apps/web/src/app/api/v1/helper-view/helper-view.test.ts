import { setDepsForTests } from "@/server/deps";
import { createHelperLink, revokeHelperLink } from "@scholarcrew/core/helpers";
import { TEST_NOW, fixedClock } from "@scholarcrew/core/shared";
import { activities, rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type HelperScope, type HelperView, userActor } from "@scholarcrew/domain";
import { errorOf, params, readJson, request, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as helperView } from "./[token]/route";

const deps = useTestDeps();

async function linkFor(scope: HelperScope[]) {
  const { user } = await factories.student(deps().db);
  await deps().db.insert(activities).values({ ownerId: user.id, position: 1, name: "Robotics Club", role: "Captain" });
  const actor = userActor(user.id, "student");
  const created = await createHelperLink(deps(), actor, {
    label: "Ms. Ortiz",
    helperRole: "recommender",
    scope,
    expiresInDays: 30,
  });
  const token = created.url.split("/h/")[1];
  if (!token) throw new Error("expected a /h/<token> url");
  return { token, linkId: created.link.id, actor };
}

function open(token: string, ip = "203.0.113.30"): Promise<Response> {
  return helperView(request(`/helper-view/${token}`, { headers: { "x-forwarded-for": ip } }), params({ token }));
}

describe("GET /helper-view/:token (HL-02, HL-03)", () => {
  it("shows only the sections in the link's scope, without a session", async () => {
    const { token } = await linkFor(["activities", "stories"]);
    const res = await open(token);
    expect(res.status).toBe(200);
    const view = await readJson<HelperView>(res);
    expect(view).toMatchObject({
      helperRole: "recommender",
      label: "Ms. Ortiz",
      deadlines: null,
      colleges: null,
      scholarships: null,
    });
    expect(view.activities?.map((a) => a.name)).toEqual(["Robotics Club"]);
    expect(view.stories).toEqual([]);
  });

  it("is 404 for unknown, expired, and revoked links", async () => {
    expect((await open("not-a-real-token")).status).toBe(404);
    const { token, linkId, actor } = await linkFor(["deadlines"]);
    setDepsForTests({ ...deps(), clock: fixedClock("2026-11-06T15:00:00.000Z") });
    const expired = await open(token);
    expect(expired.status).toBe(404);
    expect((await errorOf(expired)).code).toBe("not_found");
    setDepsForTests(deps());
    expect((await open(token)).status).toBe(200);
    await revokeHelperLink(deps(), actor, linkId);
    expect((await open(token)).status).toBe(404);
  });

  it("limits each IP to 60 views an hour", async () => {
    const { token } = await linkFor(["deadlines"]);
    await deps()
      .db.insert(rateLimits)
      .values({ key: "helper-view:203.0.113.31", windowStart: new Date(TEST_NOW), count: 60 });
    const limited = await open(token, "203.0.113.31");
    expect(limited.status).toBe(429);
    expect((await open(token, "203.0.113.32")).status).toBe(200);
  });
});
