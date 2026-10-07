import type {
  Activity,
  AidChecklist,
  ApplicationItem,
  College,
  CollegeListEntry,
  ContextSnapshot,
  CostSummary,
  Deadline,
  EssayWithBody,
  Match,
  OfferComparison,
  ProgressEvent,
  RequirementProgress,
  RoomKind,
  ScholarshipDetail,
  ScholarshipQuery,
  ScholarshipSummary,
  ShareCategory,
  SpecialistResult,
  SpecialistRole,
  Story,
  TestScore,
  WeekPlan,
} from "@scholarcrew/domain";
import type { ModelClient, ModelTurn } from "../model/types";

/** Read-only data access for agents. The worker (plan 12) implements it over core services with a system actor. */
export interface CrewDataPort {
  liveGrants(): Promise<ShareCategory[]>;
  usedCategories(): ShareCategory[];
  snapshot(ownerId: string, room: RoomKind, audience: "crew" | "family"): Promise<ContextSnapshot>;
  matches(ownerId: string, audience: "crew" | "family"): Promise<{ matches: Match[]; privateCount: number }>;
  searchScholarships(q: ScholarshipQuery): Promise<ScholarshipSummary[]>;
  scholarship(idOrSlug: string): Promise<ScholarshipDetail | null>;
  collegeList(ownerId: string): Promise<CollegeListEntry[]>;
  college(id: string): Promise<College | null>;
  applicationItems(ownerId: string): Promise<ApplicationItem[]>;
  stories(ownerId: string): Promise<Story[]>;
  story(ownerId: string, storyId: string): Promise<Story | null>;
  essay(ownerId: string, essayId: string): Promise<EssayWithBody | null>;
  costs(ownerId: string): Promise<CostSummary[]>;
  offers(ownerId: string): Promise<OfferComparison>;
  aidChecklist(ownerId: string): Promise<AidChecklist[]>;
  testScores(ownerId: string): Promise<TestScore[]>;
  activities(ownerId: string): Promise<Activity[]>;
  serviceProgress(ownerId: string): Promise<RequirementProgress[]>;
  weekPlan(ownerId: string): Promise<WeekPlan>;
  deadlines(ownerId: string): Promise<Deadline[]>;
}

export type ConsultFn = (i: {
  role: SpecialistRole;
  question: string;
  onStudentTexts?: (texts: string[]) => void;
  ownerId: string;
  audience: "crew" | "family";
  context: ContextSnapshot;
}) => Promise<SpecialistResult>;

export interface AgentDeps {
  model: ModelClient;
  port: CrewDataPort;
  consult: ConsultFn;
  now: () => Date;
  onProgress?: (e: ProgressEvent) => Promise<void>;
  onUsage?: (role: string, t: ModelTurn) => Promise<void>;
}
