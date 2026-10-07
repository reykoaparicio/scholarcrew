import type { essayComments, essayVersions, essays, stories, storyUses } from "@scholarcrew/db";
import type { Essay, EssayComment, EssayVersion, Story, StoryUse } from "@scholarcrew/domain";
import { toIso, toIsoOrNull } from "../shared";

export type EssayRow = typeof essays.$inferSelect;

/** `latestWordCount` is the word count of version `currentVersion`, or null before the first save. */
export function toEssay(row: EssayRow, latestWordCount: number | null): Essay {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    wordLimit: row.wordLimit,
    charLimit: row.charLimit,
    targetType: row.targetType,
    targetCollegeId: row.targetCollegeId,
    targetScholarshipId: row.targetScholarshipId,
    currentVersion: row.currentVersion,
    latestWordCount,
    status: row.status,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toEssayVersion(row: typeof essayVersions.$inferSelect): EssayVersion {
  return {
    id: row.id,
    essayId: row.essayId,
    version: row.version,
    body: row.body,
    wordCount: row.wordCount,
    authorId: row.authorId,
    createdAt: toIso(row.createdAt),
  };
}

export function toEssayComment(row: typeof essayComments.$inferSelect): EssayComment {
  return {
    id: row.id,
    essayId: row.essayId,
    version: row.version,
    author: row.author,
    kind: row.kind,
    quote: row.quote,
    occurrence: row.occurrence,
    body: row.body,
    resolvedAt: toIsoOrNull(row.resolvedAt),
    createdAt: toIso(row.createdAt),
  };
}

export function toStoryUse(row: typeof storyUses.$inferSelect): StoryUse {
  return {
    id: row.id,
    storyId: row.storyId,
    essayId: row.essayId,
    collegeId: row.collegeId,
    scholarshipId: row.scholarshipId,
    usedAt: toIso(row.usedAt),
  };
}

export function toStory(row: typeof stories.$inferSelect, uses: Story["uses"]): Story {
  return {
    id: row.id,
    title: row.title,
    moment: row.moment,
    themes: row.themes,
    evidence: row.evidence,
    summary: row.summary,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    archivedAt: toIsoOrNull(row.archivedAt),
    uses,
  };
}
