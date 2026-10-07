import { expect } from "@playwright/test";
import { adminSession } from "../support/admin";
import { BASE_URL } from "../support/env";
import { test } from "../support/fixtures";
import { STATE_U, signUpStudent } from "../support/onboarding";
import { externalSources, recordOffOrigin, trackerGlobals } from "../support/trackers";

const SIGNED_IN_PAGES = [
  "/week",
  "/crew",
  "/scholarships",
  "/essays",
  "/colleges",
  "/money",
  "/money/offers",
  "/family",
  "/memory",
  "/settings",
];

test("SE-05: signed-in pages load no third-party scripts, frames, or requests", async ({ browser, adminState }) => {
  const s = await signUpStudent(browser, "trackers", { collegeIds: [STATE_U.id] });
  const origin = new URL(BASE_URL).origin;
  const offOrigin = recordOffOrigin(s.page, origin);
  const cspErrors: string[] = [];
  s.page.on("console", (message) => {
    if (/content security policy|refused to (execute|load)/i.test(message.text())) cspErrors.push(message.text());
  });
  await s.page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(
        `${event.effectiveDirective}:${event.blockedURI}`,
      );
    });
  });
  for (const path of ["/", "/directory/TX", ...SIGNED_IN_PAGES]) {
    let res = await s.page.goto(path);
    // Next may stream the crew index redirect after a 200 response; audit the final document.
    if (path === "/crew") {
      await s.page.waitForURL(/\/crew\/[^/?]+$/);
      res = await s.page.reload();
    }
    expect(res?.status(), path).toBeLessThan(400);
    await s.page.waitForLoadState("load");
    expect(await externalSources(s.page, origin), path).toEqual([]);
    expect(await trackerGlobals(s.page), path).toEqual([]);
    const policy = res?.headers()["content-security-policy"] ?? "";
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce, path).toBeTruthy();
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy.split(";").find((directive) => directive.trim().startsWith("script-src "))).not.toContain(
      "'unsafe-inline'",
    );
    const nonces = await s.page
      .locator("script")
      .evaluateAll((scripts) =>
        scripts
          .filter(
            (script) =>
              (!(script as HTMLScriptElement).type || /javascript|module/.test((script as HTMLScriptElement).type)) &&
              ((script as HTMLScriptElement).src !== "" || (script.textContent ?? "").trim() !== ""),
          )
          .map((script) => (script as HTMLScriptElement).nonce),
      );
    expect(nonces.length).toBeGreaterThan(0);
    expect(nonces.every((value) => value === nonce)).toBe(true);
    expect(await s.page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
  }
  expect(offOrigin).toEqual([]);
  expect(cspErrors).toEqual([]);
  const admin = await adminSession(browser, adminState);
  admin.page.on("console", (message) => {
    if (/content security policy|refused to (execute|load)/i.test(message.text())) cspErrors.push(message.text());
  });
  await admin.page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(event.effectiveDirective);
    });
  });
  const response = await admin.page.goto("/admin/tasks");
  expect(response?.status()).toBe(200);
  const adminPolicy = response?.headers()["content-security-policy"] ?? "";
  const adminNonce = adminPolicy.match(/'nonce-([^']+)'/)?.[1];
  expect(adminNonce).toBeTruthy();
  const scriptNonces = await admin.page
    .locator("script")
    .evaluateAll((scripts) =>
      scripts
        .filter(
          (script) =>
            (!(script as HTMLScriptElement).type || /javascript|module/.test((script as HTMLScriptElement).type)) &&
            ((script as HTMLScriptElement).src !== "" || (script.textContent ?? "").trim() !== ""),
        )
        .map((script) => (script as HTMLScriptElement).nonce),
    );
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every((nonce) => nonce === adminNonce)).toBe(true);
  expect(await admin.page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
  expect(cspErrors).toEqual([]);
  await admin.context.close();
  await s.context.close();
});
