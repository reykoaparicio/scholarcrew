import { type Page, type TestInfo, expect, test } from "@playwright/test";
import { SEED_TOKENS } from "@scholarcrew/db/seed";
import { apiOk } from "../support/api";
import { auditSession, emptyAuditSession } from "../support/audit-session";
import { BASE_URL } from "../support/env";

test.skip(process.env.E2E_PRODUCTION !== "1", "Run optimized screen audits with pnpm audit:production");

const STUDENT = [
  "/week",
  "/crew",
  "/scholarships",
  "/essays",
  "/essays/stories",
  "/colleges",
  "/money",
  "/money/offers",
  "/family",
  "/memory",
  "/prep",
  "/impact",
  "/settings",
];
const PUBLIC = [
  `/h/${SEED_TOKENS.patelHelperLink}`,
  `/verify-hours/${SEED_TOKENS.riveraVerification}`,
  "/",
  "/directory",
  "/directory/TX",
  "/offer-tool",
  "/privacy",
  "/terms",
  "/ai-policy",
  "/sign-in",
  "/sign-in/check-email",
];
const ADMIN = [
  "/admin/tasks",
  "/admin/scholarships",
  "/admin/scholarships/new",
  "/admin/colleges",
  "/admin/aid",
  "/admin/reports",
  "/admin/audit",
];

async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { auditCsp: string[] }).auditCsp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { auditCsp: string[] }).auditCsp.push(
        `${event.effectiveDirective}:${event.blockedURI}:${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });
}

async function checkCsp(page: Page) {
  const violations = await page.evaluate(() => (window as unknown as { auditCsp?: string[] }).auditCsp ?? []);
  expect(violations, page.url()).toEqual([]);
}

async function checkScreen(page: Page, path: string, width: number, info: TestInfo) {
  await page.setViewportSize({ width, height: 900 });
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/);
  if (path === "/crew") await page.waitForURL(/\/crew\/[^/?]+$/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("main h1, main h2, main h3").first()).toBeVisible();
  await checkCsp(page);
  await diagnoseOverflow(page, path, width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(
    true,
  );
  await page.screenshot({
    path: info.outputPath(`${width}-${path.replaceAll("/", "_") || "landing"}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

test("all student screens and populated details fit desktop, tablet and phone", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const context = await auditSession(browser, "jordan@example.com");
  const page = await context.newPage();
  await watchCsp(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const details = new Set<string>();
  for (const path of STUDENT) {
    await checkScreen(page, path, 1440, info);
    for (const href of await page
      .locator("main a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
      if (/^\/(essays|colleges|scholarships|money\/offers)\/[^/?]+$/.test(href) && !href.endsWith("/stories"))
        details.add(href);
    }
  }
  expect(details.size).toBeGreaterThan(0);
  for (const width of [768, 390, 320])
    for (const path of [...STUDENT, ...details]) await checkScreen(page, path, width, info);
  expect(errors).toEqual([]);
  await context.close();
});

test("public and admin screens fit phone and desktop without runtime errors", async ({ browser }, info) => {
  test.setTimeout(240_000);
  for (const account of [null, "admin@example.com"]) {
    const context = account ? await auditSession(browser, account) : await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await watchCsp(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1440, 390, 320])
      for (const path of account ? ADMIN : PUBLIC) {
        await page.setViewportSize({ width, height: 900 });
        expect((await page.goto(path))?.status(), path).toBeLessThan(400);
        await expect(page.locator("main")).toBeVisible();
        await expect(page.locator("main h1, main h2, main h3").first()).toBeVisible();
        await checkCsp(page);
        await diagnoseOverflow(page, path, width);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${path} at ${width}px`,
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${width}-${path.replaceAll("/", "_") || "landing"}.png`),
          fullPage: true,
        });
      }
    expect(errors).toEqual([]);
    await context.close();
  }
});

test("parent shared screens and expired helper state fit a phone", async ({ browser }, info) => {
  const context = await auditSession(browser, "dana@example.com");
  const page = await context.newPage();
  await watchCsp(page);
  for (const path of ["/week", "/scholarships", "/colleges", "/money", "/family", "/settings"])
    await checkScreen(page, path, 320, info);
  await page.goto("/h/invalid-audit-token");
  await expect(page.getByText("This link has expired or was turned off")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test("production SSE flushes the first frame before completion and disables compression", async ({ browser }) => {
  const context = await auditSession(browser, "jordan@example.com");
  const page = await context.newPage();
  await watchCsp(page);
  await page.goto("/crew");
  await page.waitForURL(/\/crew\/[^/?]+$/);
  const room = new URL(page.url()).pathname.split("/")[2];
  const result = await apiOk<{ job: { id: string } }>(page, "POST", `/conversations/${room}/messages`, {
    body: "How should I plan this week?",
  });
  const stream = await page.evaluate(async (jobId) => {
    const response = await fetch(`/api/v1/jobs/${jobId}/events`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No stream");
    const started = performance.now();
    const first = await reader.read();
    const elapsed = performance.now() - started;
    await reader.cancel();
    return {
      status: response.status,
      text: new TextDecoder().decode(first.value),
      elapsed,
      headers: Object.fromEntries(response.headers),
    };
  }, result.job.id);
  expect(stream.status).toBe(200);
  expect(stream.text).toContain("event: job\n");
  expect(stream.elapsed).toBeLessThan(5000);
  expect(stream.headers["cache-control"]).toContain("no-transform");
  expect(stream.headers["content-encoding"]).toBeUndefined();
  expect(stream.headers["x-accel-buffering"]).toBe("no");
  await context.close();
});

test("composer preserves input through a failed send and recovers from a closed stream", async ({ browser }) => {
  const context = await auditSession(browser, "jordan@example.com");
  const page = await context.newPage();
  await watchCsp(page);
  await page.goto("/crew");
  await page.waitForURL(/\/crew\/[^/?]+$/);
  await page.route("**/api/v1/conversations/*/messages", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "internal", message: "Temporarily unavailable" } }),
      });
    else await route.continue();
  });
  const input = page.getByRole("textbox", { name: "Message your crew" });
  await input.fill("Help me compare my options");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Temporarily unavailable", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("Help me compare my options");
  await page.unroute("**/api/v1/conversations/*/messages");
  await page.route("**/api/v1/jobs/*/events", (route) =>
    route.fulfill({ status: 503, body: "Stream temporarily unavailable" }),
  );
  let polls = 0;
  page.on("request", (request) => {
    if (/\/api\/v1\/jobs\/[0-9a-f-]+$/.test(new URL(request.url()).pathname)) polls += 1;
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect.poll(() => polls).toBeGreaterThan(0);
  await expect(page.getByText("Lost the live connection. Refresh to check on your crew.")).toHaveCount(0);
  await context.close();
});

test("empty screens and unfinished onboarding retain usable phone layouts", async ({ browser }, info) => {
  const context = await emptyAuditSession(browser);
  const page = await context.newPage();
  await watchCsp(page);
  for (const path of [
    "/week",
    "/scholarships",
    "/essays",
    "/essays/stories",
    "/colleges",
    "/money/offers",
    "/prep",
    "/impact",
    "/memory",
  ])
    await checkScreen(page, path, 320, info);
  await page.goto("/essays");
  await expect(page.getByText("No essays yet", { exact: true })).toBeVisible();
  await page.goto("/colleges");
  await expect(page.getByText("No schools yet", { exact: true })).toBeVisible();
  await context.close();
  const setup = await emptyAuditSession(browser, false);
  const wizard = await setup.newPage();
  await watchCsp(wizard);
  await checkScreen(wizard, "/onboarding", 320, info);
  await expect(wizard.getByRole("heading", { level: 1 })).toBeVisible();
  await setup.close();
});

async function diagnoseOverflow(page: Page, path: string, width: number) {
  if (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) return;
  const outside = await page.evaluate(() =>
    [...document.querySelectorAll("main *, header *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1)
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        text: (el.textContent ?? "").slice(0, 60),
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
      })),
  );
  if (outside.length) console.log(JSON.stringify({ path, width, outside }));
}
