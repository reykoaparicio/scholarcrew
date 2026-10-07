import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const EssayTarget = z.enum(["college", "scholarship", "general"]);
export type EssayTarget = z.infer<typeof EssayTarget>;

export const EssayStatus = z.enum(["drafting", "ready", "submitted"]);
export type EssayStatus = z.infer<typeof EssayStatus>;

export const Essay = z.strictObject({
  id: Id,
  title: z.string(),
  prompt: z.string(),
  wordLimit: z.number().int().nullable(),
  charLimit: z.number().int().nullable(),
  targetType: EssayTarget,
  targetCollegeId: z.string().nullable(),
  targetScholarshipId: Id.nullable(),
  currentVersion: z.number().int().min(0),
  /** Word count of version `currentVersion`, null before the first save (D34). */
  latestWordCount: z.number().int().min(0).nullable(),
  status: EssayStatus,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Essay = z.infer<typeof Essay>;

export const EssayInput = z.strictObject({
  title: z.string().min(1).max(200),
  prompt: z.string().max(4000),
  wordLimit: z.number().int().min(1).max(5000).nullable().default(null),
  charLimit: z.number().int().min(1).max(20000).nullable().default(null),
  targetType: EssayTarget.default("general"),
  targetCollegeId: z.string().max(12).nullable().default(null),
  targetScholarshipId: Id.nullable().default(null),
});
export type EssayInput = z.infer<typeof EssayInput>;

/** Owner edits to an essay's title, prompt, or status; at least one key (R2P-14). */
export const EssayPatch = z
  .strictObject({
    title: EssayInput.shape.title.optional(),
    prompt: EssayInput.shape.prompt.optional(),
    status: EssayStatus.optional(),
  })
  .refine((p) => p.title !== undefined || p.prompt !== undefined || p.status !== undefined, {
    message: "Change at least one field",
  });
export type EssayPatch = z.infer<typeof EssayPatch>;

export const CommentAuthor = z.enum(["quill", "helper", "user"]);
export type CommentAuthor = z.infer<typeof CommentAuthor>;

export const CommentKind = z.enum(["question", "structure", "clarity", "prompt_fit", "word_budget"]);
export type CommentKind = z.infer<typeof CommentKind>;

export const EssayComment = z.strictObject({
  id: Id,
  essayId: Id,
  version: z.number().int(),
  author: CommentAuthor,
  kind: CommentKind,
  quote: z.string(),
  occurrence: z.number().int().min(1),
  body: z.string(),
  resolvedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type EssayComment = z.infer<typeof EssayComment>;

/** What Quill submits for one comment. The integrity guard checks `body`. */
export const QuillCommentDraft = z.strictObject({
  quote: z.string().min(1).max(400),
  occurrence: z.number().int().min(1).max(20),
  kind: CommentKind,
  body: z.string().min(1).max(400),
});
export type QuillCommentDraft = z.infer<typeof QuillCommentDraft>;

export const EssayWithBody = Essay.extend({
  body: z.string(),
  wordCount: z.number().int().min(0),
  comments: z.array(EssayComment),
  targetLabel: z.string().nullable(),
});
export type EssayWithBody = z.infer<typeof EssayWithBody>;

export const EssayVersion = z.strictObject({
  id: Id,
  essayId: Id,
  version: z.number().int().min(1),
  body: z.string(),
  wordCount: z.number().int().min(0),
  authorId: Id,
  createdAt: IsoDateTime,
});
export type EssayVersion = z.infer<typeof EssayVersion>;

export const SaveVersionInput = z.strictObject({
  body: z.string().max(50_000),
  baseVersion: z.number().int().min(0),
});
export type SaveVersionInput = z.infer<typeof SaveVersionInput>;

export const Story = z.strictObject({
  id: Id,
  title: z.string(),
  moment: z.string(),
  themes: z.array(z.string()),
  evidence: z.string(),
  summary: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: IsoDateTime.nullable(),
  uses: z.array(
    z.strictObject({
      essayId: Id,
      essayTitle: z.string(),
      collegeId: z.string().nullable(),
      scholarshipId: Id.nullable(),
      usedAt: IsoDateTime,
    }),
  ),
});
export type Story = z.infer<typeof Story>;

export const StoryInput = z.strictObject({
  title: z.string().min(1).max(120),
  moment: z.string().min(1).max(4000),
  themes: z.array(z.string().min(1).max(40)).max(8).default([]),
  evidence: z.string().max(2000).default(""),
  summary: z.string().max(400).default(""),
});
export type StoryInput = z.infer<typeof StoryInput>;

export const StoryPatch = z.strictObject({
  title: z.string().min(1).max(120).optional(),
  moment: z.string().min(1).max(4000).optional(),
  themes: z.array(z.string().min(1).max(40)).max(8).optional(),
  evidence: z.string().max(2000).optional(),
  summary: z.string().max(400).optional(),
});
export type StoryPatch = z.infer<typeof StoryPatch>;

export const StoryUse = z.strictObject({
  id: Id,
  storyId: Id,
  essayId: Id,
  collegeId: z.string().nullable(),
  scholarshipId: Id.nullable(),
  usedAt: IsoDateTime,
});
export type StoryUse = z.infer<typeof StoryUse>;

export const LinkStoryInput = z.strictObject({ storyId: Id, essayId: Id });
export type LinkStoryInput = z.infer<typeof LinkStoryInput>;

export const StoryReuseCheckInput = z.strictObject({
  storyId: Id,
  collegeId: z.string().max(12).optional(),
  scholarshipId: Id.optional(),
});
export type StoryReuseCheckInput = z.infer<typeof StoryReuseCheckInput>;

export const StoryReuseCheck = z.strictObject({
  storyId: Id,
  alreadyUsedForTarget: z.boolean(),
  priorUses: z.number().int().min(0),
  message: z.string().nullable(),
});
export type StoryReuseCheck = z.infer<typeof StoryReuseCheck>;
