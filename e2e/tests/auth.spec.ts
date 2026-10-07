import { expect, test } from "@playwright/test";
import type { ApiErrorBody } from "../support/api";
import { BASE_URL } from "../support/env";
import {
  SIGN_IN_SUBJECT,
  VERIFY_LINK,
  latestEmail,
  linkFrom,
  newSession,
  signInViaUi,
  uniqueEmail,
} from "../support/users";

test.describe("sign-in (ID-01, ID-02)", () => {
  test("a new student signs in from /sign-in with the emailed link and lands on onboarding", async ({ browser }) => {
    const s = await newSession(browser, "signin");
    await signInViaUi(s);
    await expect(s.page).toHaveURL(/\/onboarding$/);
    await expect(s.page.getByRole("heading", { level: 1, name: "Tell us about you" })).toBeVisible();
    const cookie = (await s.context.cookies()).find((c) => c.name === "sc_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    await s.context.close();
  });

  test("a sign-in link works only once", async ({ browser }) => {
    const s = await newSession(browser, "once");
    await signInViaUi(s);
    const email = await latestEmail(s.page, s.email, SIGN_IN_SUBJECT);
    const replay = await newSession(browser, "once-replay");
    await replay.page.goto(linkFrom(email.text, VERIFY_LINK));
    await expect(replay.page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(replay.page.getByText("That sign-in link has expired or was already used.")).toBeVisible();
    expect((await replay.context.cookies()).some((c) => c.name === "sc_session")).toBe(false);
    await s.context.close();
    await replay.context.close();
  });

  test("the sixth sign-in request from one address is 429 with Retry-After (SE-04, R3A-11)", async ({ browser }) => {
    // Plan 06 allows 5 magic links per 15 minutes per IP. Unique emails keep the per-email limit out of it.
    const s = await newSession(browser, "limit");
    for (let i = 0; i < 5; i += 1) {
      const ok = await s.page.request.post("/api/v1/auth/magic-link", {
        headers: { Origin: BASE_URL },
        data: { email: uniqueEmail(`limit${i}`) },
      });
      expect(ok.status(), `request ${i + 1}`).toBe(204);
    }
    const res = await s.page.request.post("/api/v1/auth/magic-link", {
      headers: { Origin: BASE_URL },
      data: { email: uniqueEmail("limit5") },
    });
    expect(res.status()).toBe(429);
    const header = res.headers()["retry-after"] ?? "";
    expect(header).toMatch(/^\d+$/);
    const seconds = Number(header);
    expect(seconds).toBeGreaterThanOrEqual(1);
    expect(seconds).toBeLessThanOrEqual(900);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.details).toEqual({ retryAfterSeconds: seconds });
    // 06's waitText names the real wait instead of "a few minutes".
    expect(body.error.message).toMatch(/^Too many requests\. Try again in \d+ minutes\.$/);
    await s.context.close();
  });
});
