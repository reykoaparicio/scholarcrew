import type { Page } from "@playwright/test";
import type { CatalogTask, ScholarshipSummary } from "@scholarcrew/domain";
import { apiOk } from "./api";

/** POST /scholarships/local: a draft, submitter-only listing plus a user_submission review task. */
export async function submitLocalScholarship(
  student: Page,
  o: { name: string; url: string; notes: string },
): Promise<ScholarshipSummary> {
  return apiOk<ScholarshipSummary>(student, "POST", "/scholarships/local", o);
}

/** The user_submission task for a submitted listing, read through the admin API. */
export async function taskForListing(admin: Page, scholarshipId: string): Promise<CatalogTask> {
  const tasks = await apiOk<CatalogTask[]>(admin, "GET", "/admin/catalog-tasks?kind=user_submission");
  const task = tasks.find((t) => t.scholarshipId === scholarshipId);
  if (!task) throw new Error(`No user_submission task for listing ${scholarshipId} among ${tasks.length} tasks`);
  return task;
}
