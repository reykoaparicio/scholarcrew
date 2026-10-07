import { expect, test } from "@playwright/test";
import type { OfferComparison, OfferWithLines } from "@scholarcrew/domain";
import { awardYearOn } from "../support/admin";
import { apiOk } from "../support/api";
import { readJobStream, sseEvents, waitForJob } from "../support/crew";
import { DEMO_OFFER_LINES, PDF_LETTER, expectedDemoColumn, usd } from "../support/offers";
import { STATE_U, signUpStudent } from "../support/onboarding";

test("flow 4: an award letter is uploaded, read, reviewed, confirmed, and compared (MO-04..MO-06)", async ({
  browser,
}) => {
  const s = await signUpStudent(browser, "offer", { collegeIds: [STATE_U.id] });
  await s.page.goto("/money/offers");
  await expect(s.page.getByRole("heading", { level: 1, name: "Compare offers" })).toBeVisible();
  // Plan 15's Card is a <section> whose string title is an h2.
  const uploadCard = s.page.locator("section", {
    has: s.page.getByRole("heading", { level: 2, name: "Add an award letter", exact: true }),
  });
  await uploadCard.getByLabel("College", { exact: true }).selectOption({ label: STATE_U.name });
  await expect(uploadCard.getByLabel("Award year", { exact: true })).toHaveValue(awardYearOn(new Date()));
  await uploadCard.getByLabel("Award letter file", { exact: true }).setInputFiles({
    name: "state-u-award-letter.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(PDF_LETTER),
  });
  const stream = s.page.waitForRequest((r) => /\/api\/v1\/jobs\/[0-9a-f-]{36}\/events$/.test(r.url()));
  await uploadCard.getByRole("button", { name: "Upload letter", exact: true }).click();
  const parseJobId = new URL((await stream).url()).pathname.split("/")[4] ?? "";
  const review = uploadCard
    .locator("p", { hasText: "Aid labeled every line." })
    .getByRole("link", { name: "Review the lines", exact: true });
  await expect(review).toBeVisible({ timeout: 120_000 });

  // R3E-1/R3E-2: the stream opts out of compression and proxy buffering, and comment blocks are skipped.
  expect((await waitForJob(s.page, parseJobId)).status).toBe("ready");
  const raw = await readJobStream(s.page, parseJobId);
  expect(raw.status).toBe(200);
  expect(raw.headers["content-type"]).toMatch(/^text\/event-stream/);
  expect(raw.headers["cache-control"]).toBe("no-cache, no-transform");
  expect(raw.headers["x-accel-buffering"]).toBe("no");
  expect(raw.headers["content-encoding"] ?? "identity").not.toMatch(/gzip|br|deflate/);
  expect(raw.events).toEqual(["job", "end"]);
  expect(sseEvents(": ping\n\nevent: job\ndata: {}\n\n: ping\n\nevent: end\ndata: {}\n\n")).toEqual(["job", "end"]);

  await review.click();

  await expect(s.page).toHaveURL(/\/money\/offers\/[0-9a-f-]{36}$/);
  const offerId = new URL(s.page.url()).pathname.split("/")[3] ?? "";
  await expect(s.page.getByRole("heading", { level: 1, name: "Check your award letter" })).toBeVisible();
  for (const line of DEMO_OFFER_LINES) {
    await expect(s.page.getByLabel(`${line.label} category`, { exact: true })).toBeVisible();
  }
  const parsed = await apiOk<OfferWithLines>(s.page, "GET", `/offers/${offerId}`);
  expect(parsed.status).toBe("needs_review");
  expect(parsed.lines.map((l) => [l.label, l.amountUsd, l.category])).toEqual(
    DEMO_OFFER_LINES.map((l) => [l.label, l.amountUsd, l.category]),
  );

  await s.page.getByRole("button", { name: "Confirm these lines" }).click();
  await expect(s.page).toHaveURL(/\/money\/offers$/);
  expect((await apiOk<OfferWithLines>(s.page, "GET", `/offers/${offerId}`)).status).toBe("confirmed");

  const expected = expectedDemoColumn(offerId, STATE_U.id, STATE_U.name);
  expect(expected.reallyCostsUsd).toBe(9_200);
  expect(expected.fourYearUsd).toBe(36_800);
  const comparison = await apiOk<OfferComparison>(s.page, "GET", "/offers/compare");
  expect(comparison.columns.find((c) => c.offerId === offerId)).toMatchObject({
    costOfAttendanceUsd: expected.costOfAttendanceUsd,
    freeMoneyUsd: expected.freeMoneyUsd,
    workStudyUsd: expected.workStudyUsd,
    loansUsd: expected.loansUsd,
    letterSaysOweUsd: expected.letterSaysOweUsd,
    reallyCostsUsd: expected.reallyCostsUsd,
    fourYearUsd: expected.fourYearUsd,
  });

  const table = s.page.getByRole("table", { name: "Offer comparison" });
  await expect(table.getByRole("columnheader", { name: STATE_U.name, exact: true })).toBeVisible();
  await expect(table.getByRole("row", { name: /Free money \(grants \+ scholarships\)/ })).toContainText(
    usd(expected.freeMoneyUsd),
  );
  await expect(table.getByRole("row", { name: /What the letter says you owe/ })).toContainText(
    usd(expected.letterSaysOweUsd),
  );
  await expect(table.getByRole("row", { name: /Really costs you, year 1/ })).toContainText(
    usd(expected.reallyCostsUsd),
  );
  await expect(table.getByRole("row", { name: /Over 4 years/ })).toContainText(usd(expected.fourYearUsd));
  await s.context.close();
});
