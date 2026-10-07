import { expect, test } from "@playwright/test";
import type { Essay, MeResponse } from "@scholarcrew/domain";
import { BASE_URL } from "../support/env";
import { signUpStudent } from "../support/onboarding";
import { rawClient, sessionCookie } from "../support/raw";

const ESSAY = { title: "Origin check", prompt: "", wordLimit: null, charLimit: null };
const FORBIDDEN = { code: "forbidden", message: "This request didn't come from ScholarCrew" };

test.describe("Origin check on cookie routes (ID-06)", () => {
  test("a cookie-authenticated POST or DELETE without Origin, or with a foreign Origin, is rejected", async ({
    browser,
  }) => {
    const s = await signUpStudent(browser, "csrf");
    const raw = await rawClient(await sessionCookie(s.context), s.ip);

    const missing = await raw.post("/api/v1/essays", { data: ESSAY });
    expect(missing.status()).toBe(403);
    expect(((await missing.json()) as { error: typeof FORBIDDEN }).error).toMatchObject(FORBIDDEN);

    const foreign = await raw.post("/api/v1/essays", { data: ESSAY, headers: { origin: "https://evil.example" } });
    expect(foreign.status()).toBe(403);

    const deleteAccount = await raw.delete("/api/v1/account");
    expect(deleteAccount.status()).toBe(403);

    // GETs don't need Origin: the cookie still works, the account still exists, and no essay was created.
    const me = await raw.get("/api/v1/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as MeResponse).user.email).toBe(s.email);
    expect((await (await raw.get("/api/v1/essays")).json()) as Essay[]).toEqual([]);
    await raw.dispose();
    await s.context.close();
  });

  test("the same request with the app's Origin succeeds", async ({ browser }) => {
    const s = await signUpStudent(browser, "csrf-ok");
    const raw = await rawClient(await sessionCookie(s.context), s.ip);
    const ok = await raw.post("/api/v1/essays", { data: ESSAY, headers: { origin: BASE_URL } });
    expect(ok.status()).toBe(201);
    expect(((await ok.json()) as Essay).title).toBe(ESSAY.title);
    await raw.dispose();
    await s.context.close();
  });
});
