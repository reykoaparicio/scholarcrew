import { TEST_NOW } from "@scholarcrew/core/shared";
import { eq, offerLines, offers, rateLimits } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type {
  CostSummary,
  CrewJob,
  LoanEstimate,
  OfferComparison,
  OfferLine,
  OfferWithLines,
} from "@scholarcrew/domain";
import {
  NO_PARAMS,
  errorOf,
  exhaustAllowance,
  params,
  readJson,
  request,
  signedInParent,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { PUT as putCalculator } from "../costs/calculator/route";
import { GET as getCosts } from "../costs/route";
import { PATCH as patchLine } from "../offer-lines/[id]/route";
import { POST as offerTool } from "../public/offer-tool/route";
import { POST as appeal } from "./[id]/appeal/route";
import { POST as confirm } from "./[id]/confirm/route";
import { GET as loans } from "./[id]/loans/route";
import { GET as getOffer, DELETE as removeOffer } from "./[id]/route";
import { GET as compare } from "./compare/route";
import { POST as createOffer, GET as listOffers } from "./route";

const deps = useTestDeps();

async function seedOffer(ownerId: string) {
  const college = await factories.college(deps().db, { name: "Maple State University" });
  const [offer] = await deps()
    .db.insert(offers)
    .values({
      ownerId,
      collegeId: college.id,
      awardYear: "2027-28",
      status: "needs_review",
      costOfAttendanceUsd: 30000,
    })
    .returning();
  if (!offer) throw new Error("offer insert failed");
  const [line] = await deps()
    .db.insert(offerLines)
    .values({ offerId: offer.id, position: 0, label: "Presidential grant", amountUsd: 10000, category: "grant" })
    .returning();
  if (!line) throw new Error("line insert failed");
  return { college, offer, line };
}

describe("costs (MO-01..MO-03)", () => {
  it("saves a calculator result and reads costs, including for a sharing parent", async () => {
    const student = await signedInStudent(deps().db);
    const college = await factories.college(deps().db);
    const body = { collegeId: college.id, costOfAttendanceUsd: 30000, grantsUsd: 12000 };
    const res = await putCalculator(
      request("/costs/calculator", { method: "PUT", cookie: student.cookie, body }),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await readJson<CostSummary>(res)).toMatchObject({
      collegeId: college.id,
      source: "calculator",
      costOfAttendanceUsd: 30000,
      freeMoneyUsd: 12000,
    });
    const over = { ...body, grantsUsd: 40000 };
    expect(
      (
        await putCalculator(
          request("/costs/calculator", { method: "PUT", cookie: student.cookie, body: over }),
          NO_PARAMS,
        )
      ).status,
    ).toBe(400);
    expect((await getCosts(request("/costs", { cookie: student.cookie }), NO_PARAMS)).status).toBe(200);
    const parent = await signedInParent(deps().db);
    await factories.family(deps().db, { studentIds: [student.user.id], parentIds: [parent.user.id] });
    const asParent = await getCosts(
      request(`/costs?studentId=${student.user.id}`, { cookie: parent.cookie }),
      NO_PARAMS,
    );
    expect(asParent.status).toBe(200);
    expect((await getCosts(request("/costs"), NO_PARAMS)).status).toBe(401);
  });
});

describe("award letters (MO-04..MO-09)", () => {
  it("lists, reads, corrects, confirms, and compares offers", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer, line } = await seedOffer(user.id);
    const list = await readJson<OfferWithLines[]>(await listOffers(request("/offers", { cookie }), NO_PARAMS));
    expect(list.map((o) => o.id)).toEqual([offer.id]);
    // D31: every offer carries the newest offer.parse job id (null here: the offer was seeded without one).
    expect(list[0]).toHaveProperty("parseJobId", null);
    const one = await getOffer(request(`/offers/${offer.id}`, { cookie }), params({ id: offer.id }));
    const detail = await readJson<OfferWithLines>(one);
    expect(detail.lines).toHaveLength(1);
    expect(detail).toHaveProperty("parseJobId", null);

    const linePath = `/offer-lines/${line.id}`;
    const fixed = await patchLine(
      request(linePath, { method: "PATCH", cookie, body: { amountUsd: 11000 } }),
      params({ id: line.id }),
    );
    expect(await readJson<OfferLine>(fixed)).toMatchObject({ amountUsd: 11000, userCorrected: true });
    expect(
      (
        await patchLine(
          request(linePath, { method: "PATCH", cookie, body: { category: "gift" } }),
          params({ id: line.id }),
        )
      ).status,
    ).toBe(400);

    const confirmed = await confirm(
      request(`/offers/${offer.id}/confirm`, { method: "POST", cookie }),
      params({ id: offer.id }),
    );
    expect((await readJson<OfferWithLines>(confirmed)).status).toBe("confirmed");
    const comparison = await readJson<OfferComparison>(
      await compare(request("/offers/compare", { cookie }), NO_PARAMS),
    );
    expect(comparison.columns.map((c) => c.offerId)).toEqual([offer.id]);
    expect(
      await readJson<LoanEstimate[]>(
        await loans(request(`/offers/${offer.id}/loans`, { cookie }), params({ id: offer.id })),
      ),
    ).toEqual([]);
  });

  it("starts an appeal outline job with 202 and hides offers from other students", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer, line } = await seedOffer(user.id);
    const res = await appeal(
      request(`/offers/${offer.id}/appeal`, { method: "POST", cookie }),
      params({ id: offer.id }),
    );
    expect(res.status).toBe(202);
    const job = await readJson<CrewJob>(res);
    expect(job).toMatchObject({ kind: "appeal_outline", status: "queued", refId: offer.id });
    expect(deps().jobs.sent).toContainEqual({ name: "appeal.outline", payload: { jobId: job.id, offerId: offer.id } });

    const other = await signedInStudent(deps().db);
    expect(
      (await getOffer(request(`/offers/${offer.id}`, { cookie: other.cookie }), params({ id: offer.id }))).status,
    ).toBe(404);
    const steal = { method: "PATCH", cookie: other.cookie, body: { amountUsd: 1 } };
    expect((await patchLine(request(`/offer-lines/${line.id}`, steal), params({ id: line.id }))).status).toBe(404);
    expect(
      (
        await appeal(
          request(`/offers/${offer.id}/appeal`, { method: "POST", cookie: other.cookie }),
          params({ id: offer.id }),
        )
      ).status,
    ).toBe(404);
  });

  it("answers 402 limit_reached for an appeal and queues nothing once the crew allowance is used (CR-10)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer } = await seedOffer(user.id);
    await exhaustAllowance(deps().db, user.id);
    const res = await appeal(
      request(`/offers/${offer.id}/appeal`, { method: "POST", cookie }),
      params({ id: offer.id }),
    );
    expect(res.status).toBe(402);
    expect((await errorOf(res)).code).toBe("limit_reached");
    expect(deps().jobs.sent).toEqual([]);
  });

  it("validates new offers and needs the student's own award letter", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const college = await factories.college(deps().db);
    const bad = await createOffer(
      request("/offers", { method: "POST", cookie, body: { collegeId: college.id, awardYear: "2027" } }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
    const body = { collegeId: college.id, awardYear: "2027-28", documentId: "00000000-0000-4000-8000-000000000001" };
    const missing = await createOffer(request("/offers", { method: "POST", cookie, body }), NO_PARAMS);
    expect(missing.status).toBe(404);
  });

  it("removes a letter that isn't confirmed and keeps confirmed ones (R2P-8)", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const { offer } = await seedOffer(user.id);
    const path = `/offers/${offer.id}`;
    const id = params({ id: offer.id });
    const other = await signedInStudent(deps().db);
    expect((await removeOffer(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await removeOffer(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect((await getOffer(request(path, { cookie }), id)).status).toBe(404);
    expect(await deps().db.select().from(offerLines).where(eq(offerLines.offerId, offer.id))).toEqual([]);

    const kept = (await seedOffer(user.id)).offer;
    const keptId = params({ id: kept.id });
    await confirm(request(`/offers/${kept.id}/confirm`, { method: "POST", cookie }), keptId);
    const refused = await removeOffer(request(`/offers/${kept.id}`, { method: "DELETE", cookie }), keptId);
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toEqual({
      code: "conflict",
      message: "Confirmed offers stay. Start a new season to archive them.",
    });
    expect((await getOffer(request(`/offers/${kept.id}`, { cookie }), keptId)).status).toBe(200);
  });
});

describe("POST /public/offer-tool (MO-11)", () => {
  const input = {
    offers: [
      {
        name: "Maple State",
        costOfAttendanceUsd: 30000,
        lines: [{ label: "Grant", amountUsd: 10000, category: "grant", renewable: true }],
      },
    ],
  };
  const headers = { "x-forwarded-for": "203.0.113.9" };

  it("compares offers without signing in and validates the body", async () => {
    const res = await offerTool(request("/public/offer-tool", { method: "POST", body: input, headers }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect((await readJson<OfferComparison>(res)).columns).toHaveLength(1);
    const bad = await offerTool(
      request("/public/offer-tool", { method: "POST", body: { offers: [] }, headers }),
      NO_PARAMS,
    );
    expect(bad.status).toBe(400);
    const huge = { offers: [{ ...input.offers[0], name: "n".repeat(70_000) }] };
    expect(
      (await offerTool(request("/public/offer-tool", { method: "POST", body: huge, headers }), NO_PARAMS)).status,
    ).toBe(413);
  });

  it("limits each IP to 30 requests an hour", async () => {
    await deps()
      .db.insert(rateLimits)
      .values({ key: "offer-tool:203.0.113.9", windowStart: new Date(TEST_NOW), count: 30 });
    const limited = await offerTool(request("/public/offer-tool", { method: "POST", body: input, headers }), NO_PARAMS);
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("rate_limited");
    const otherIp = { "x-forwarded-for": "203.0.113.10" };
    expect(
      (await offerTool(request("/public/offer-tool", { method: "POST", body: input, headers: otherIp }), NO_PARAMS))
        .status,
    ).toBe(200);
  });
});
