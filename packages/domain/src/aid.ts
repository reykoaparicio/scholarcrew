import { z } from "zod";
import { AwardYear, HttpUrl, Id, IsoDate, IsoDateTime, TaskStatus } from "./common";

export const AidProgram = z.enum(["fafsa", "css"]);
export type AidProgram = z.infer<typeof AidProgram>;

export const AssigneeKind = z.enum(["student", "parent"]);
export type AssigneeKind = z.infer<typeof AssigneeKind>;

export const AidChecklistItem = z.strictObject({
  id: Id,
  awardYear: AwardYear,
  program: AidProgram,
  collegeId: z.string().nullable(),
  key: z.string(),
  title: z.string(),
  assignee: AssigneeKind,
  status: TaskStatus,
  dueOn: IsoDate.nullable(),
  completedAt: IsoDateTime.nullable(),
});
export type AidChecklistItem = z.infer<typeof AidChecklistItem>;

export const AidChecklist = z.strictObject({
  program: AidProgram,
  awardYear: AwardYear,
  collegeId: z.string().nullable(),
  collegeName: z.string().nullable(),
  items: z.array(AidChecklistItem),
  doneCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
});
export type AidChecklist = z.infer<typeof AidChecklist>;

export const AidChecklistPatch = z.strictObject({ status: TaskStatus });
export type AidChecklistPatch = z.infer<typeof AidChecklistPatch>;

export const AidDeadline = z.strictObject({
  id: Id,
  awardYear: AwardYear,
  state: z.string().nullable(),
  program: z.string(),
  deadline: IsoDate.nullable(),
  note: z.string(),
  sourceUrl: HttpUrl,
  verifiedAt: IsoDateTime,
});
export type AidDeadline = z.infer<typeof AidDeadline>;

/** FAFSA steps for one award year. `assignee: "parent"` steps also become family tasks. */
export const FAFSA_STEPS: Array<{ key: string; title: string; assignee: "student" | "parent" }> = [
  { key: "studentaid_account", title: "Create your StudentAid.gov account", assignee: "student" },
  { key: "invite_contributors", title: "Add your parent as a contributor on the FAFSA", assignee: "student" },
  {
    key: "contributor_account",
    title: "Create a StudentAid.gov account and add your info as a contributor",
    assignee: "parent",
  },
  { key: "contributor_consent", title: "Give consent to share federal tax information", assignee: "parent" },
  { key: "student_sections", title: "Fill in your sections and list your colleges", assignee: "student" },
  { key: "submit", title: "Submit the FAFSA", assignee: "student" },
  { key: "review_summary", title: "Review your FAFSA Submission Summary", assignee: "student" },
];

export const CSS_STEPS: Array<{ key: string; title: string; assignee: "student" | "parent" }> = [
  { key: "css_account", title: "Create a College Board account for the CSS Profile", assignee: "student" },
  { key: "css_parent_info", title: "Enter household finances on the CSS Profile", assignee: "parent" },
  { key: "css_submit", title: "Submit the CSS Profile to this college", assignee: "student" },
];
