import { expect } from "@playwright/test";
import type { Board, ScholarshipDetail } from "@scholarcrew/domain";
import { adminSession, slugify, uniqueListingName } from "../support/admin";
import { type ApiErrorBody, api, apiOk } from "../support/api";
import { submitLocalScholarship, taskForListing } from "../support/catalog";
import { test } from "../support/fixtures";
import { signUpStudent } from "../support/onboarding";
import { newSession } from "../support/users";

test.describe("catalog review (AD-01, AD-02, CA-04)", () => {
  test("an admin publishes a student's local submission from the review queue", async ({ browser, adminState }) => {
    const student = await signUpStudent(browser, "submitter");
    const name = uniqueListingName("Eastside Robotics Booster Award");
    const notes = "Flyer from the counselor's office.";
    const summary = await submitLocalScholarship(student.page, {
      name,
      url: `https://example.org/e2e/${slugify(name)}`,
      notes,
    });
    expect(summary.status).toBe("draft");
    // R2C-12: submitting also puts the listing on the student's board as planned (07 G6), with no second request.
    const board = await apiOk<Board>(student.page, "GET", "/scholarship-applications");
    expect(board.working.find((c) => c.scholarship.id === summary.id)?.application.stage).toBe("planned");
    const visitor = await newSession(browser, "before-publish");
    expect((await visitor.page.request.get(`/api/v1/scholarships/${summary.slug}`)).status()).toBe(404);

    const admin = await adminSession(browser, adminState);
    const task = await taskForListing(admin.page, summary.id);
    await admin.page.goto(`/admin/tasks?task=${task.id}`);
    await expect(admin.page.getByRole("heading", { level: 2, name })).toBeVisible();
    await expect(admin.page.getByText(notes)).toBeVisible();
    await admin.page.getByLabel("Decision note", { exact: true }).fill("Checked the flyer against the sponsor's page.");
    // In fake mode the extractor can't fetch the page, so the payload has no draft: 18 shows the plain submission
    // Publish (R2C-6 swaps it for the draft Publish only when a draft exists), and there's exactly one.
    const publish = admin.page.getByRole("button", { name: "Publish", exact: true });
    await expect(publish).toHaveCount(1);
    await publish.click();
    await expect(admin.page.getByText(`Published ${name}.`, { exact: true })).toBeVisible();

    const resolved = await apiOk<Array<{ id: string }>>(
      admin.page,
      "GET",
      "/admin/catalog-tasks?status=resolved&kind=user_submission",
    );
    expect(resolved.map((t) => t.id)).toContain(task.id);

    const after = await visitor.page.request.get(`/api/v1/scholarships/${summary.slug}`);
    expect(after.status()).toBe(200);
    expect(((await after.json()) as ScholarshipDetail).status).toBe("published");
    await visitor.page.goto(`/directory/s/${summary.slug}`);
    await expect(visitor.page.getByRole("heading", { level: 1, name })).toBeVisible();

    await student.context.close();
    await admin.context.close();
    await visitor.context.close();
  });

  test("a student gets 404 from the admin console and the admin API, and can't publish their own submission", async ({
    browser,
  }) => {
    const student = await signUpStudent(browser, "not-admin");
    const name = uniqueListingName("Probe Award");
    const summary = await submitLocalScholarship(student.page, {
      name,
      url: `https://example.org/e2e/${slugify(name)}`,
      notes: "",
    });
    expect(summary.status).toBe("draft");

    const publish = await api<ApiErrorBody>(student.page, "POST", `/admin/scholarships/${summary.id}/status`, {
      status: "published",
      note: "",
    });
    expect(publish.status).toBe(404);
    expect(publish.body.error.code).toBe("not_found");
    const list = await api<ApiErrorBody>(student.page, "GET", "/admin/catalog-tasks");
    expect(list.status).toBe(404);
    expect(list.body.error.code).toBe("not_found");
    const page = await student.page.goto("/admin/tasks");
    expect(page?.status()).toBe(404);

    // The listing is still unpublished: a visitor can't see it.
    const visitor = await newSession(browser, "probe-visitor");
    expect((await visitor.page.request.get(`/api/v1/scholarships/${summary.slug}`)).status()).toBe(404);
    await student.context.close();
    await visitor.context.close();
  });
});
