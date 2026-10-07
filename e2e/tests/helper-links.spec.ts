import { expect, test } from "@playwright/test";
import type { HelperLinkCreated } from "@scholarcrew/domain";
import { type ApiErrorBody, api, apiOk } from "../support/api";
import { expireHelperLink } from "../support/db";
import { BASE_URL } from "../support/env";
import { signUpStudent } from "../support/onboarding";
import { newSession } from "../support/users";

const GONE = "This link has expired or was turned off";

function tokenFrom(url: string): string {
  const token = new URL(url).pathname.split("/h/")[1];
  if (!token) throw new Error(`No helper token in ${url}`);
  return token;
}

test.describe("helper links (HL-01, HL-02, HL-04)", () => {
  test("a helper link opens without an account, then 404s once it has expired", async ({ browser }) => {
    const s = await signUpStudent(browser, "helper-owner");
    const created = await apiOk<HelperLinkCreated>(s.page, "POST", "/helper-links", {
      label: "Ms. Patel",
      helperRole: "recommender",
      scope: ["activities", "deadlines"],
      expiresInDays: 7,
    });
    const token = tokenFrom(created.url);
    expect(created.url).toBe(`${BASE_URL}/h/${token}`);

    const helper = await newSession(browser, "helper");
    const open = await helper.page.goto(`/h/${token}`);
    expect(open?.status()).toBe(200);
    await expect(helper.page.getByRole("heading", { level: 1 })).toHaveText(/^Hi Ms\. Patel\./);
    await expect(helper.page.getByRole("heading", { name: "Not in this link" })).toBeVisible();
    expect((await helper.page.request.get(`/api/v1/helper-view/${token}`)).status()).toBe(200);

    await expireHelperLink(created.link.id);

    const viaApi = await helper.page.request.get(`/api/v1/helper-view/${token}`);
    expect(viaApi.status()).toBe(404);
    expect(((await viaApi.json()) as ApiErrorBody).error.message).toBe(`${GONE}.`);
    const viaPage = await helper.page.goto(`/h/${token}`);
    expect(viaPage?.status()).toBe(404);
    await expect(helper.page.getByText(GONE)).toBeVisible();
    await s.context.close();
    await helper.context.close();
  });

  test("a revoked helper link 404s right away", async ({ browser }) => {
    const s = await signUpStudent(browser, "helper-revoker");
    const created = await apiOk<HelperLinkCreated>(s.page, "POST", "/helper-links", {
      label: "Coach Lee",
      helperRole: "mentor",
      scope: ["deadlines"],
      expiresInDays: 30,
    });
    const token = tokenFrom(created.url);
    const helper = await newSession(browser, "helper-revoked");
    expect((await helper.page.request.get(`/api/v1/helper-view/${token}`)).status()).toBe(200);

    expect((await api(s.page, "DELETE", `/helper-links/${created.link.id}`)).status).toBe(204);

    expect((await helper.page.request.get(`/api/v1/helper-view/${token}`)).status()).toBe(404);
    const viaPage = await helper.page.goto(`/h/${token}`);
    expect(viaPage?.status()).toBe(404);
    await expect(helper.page.getByText(GONE)).toBeVisible();
    await s.context.close();
    await helper.context.close();
  });
});
