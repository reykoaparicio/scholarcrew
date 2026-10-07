import { z } from "zod";
import { Id, IsoDate, IsoDateTime, Usd } from "./common";

export const TestKind = z.enum(["ACT", "SAT", "PSAT"]);
export type TestKind = z.infer<typeof TestKind>;

export const COMPOSITE_RANGE: Record<TestKind, { min: number; max: number }> = {
  ACT: { min: 1, max: 36 },
  SAT: { min: 400, max: 1600 },
  PSAT: { min: 320, max: 1520 },
};

export const TestScore = z.strictObject({
  id: Id,
  test: TestKind,
  takenOn: IsoDate,
  official: z.boolean(),
  composite: z.number().int(),
  sections: z.record(z.string(), z.number().int()),
  createdAt: IsoDateTime,
});
export type TestScore = z.infer<typeof TestScore>;

export const TestScoreInput = z
  .strictObject({
    test: TestKind,
    takenOn: IsoDate,
    official: z.boolean(),
    composite: z.number().int(),
    sections: z.record(z.string().min(1).max(30), z.number().int().min(0).max(800)),
  })
  .refine((v) => v.composite >= COMPOSITE_RANGE[v.test].min && v.composite <= COMPOSITE_RANGE[v.test].max, {
    message: "Composite out of range for this test",
    path: ["composite"],
  });
export type TestScoreInput = z.infer<typeof TestScoreInput>;

export const Superscore = z.strictObject({
  test: TestKind,
  composite: z.number().int(),
  sections: z.record(z.string(), z.number().int()),
  fromDates: z.array(IsoDate),
});
export type Superscore = z.infer<typeof Superscore>;

export const RetakeAnalysisInput = z.strictObject({
  test: z.enum(["ACT", "SAT"]),
  targetComposite: z.number().int().min(1).max(1600),
});
export type RetakeAnalysisInput = z.infer<typeof RetakeAnalysisInput>;

export const RetakeAnalysis = z.strictObject({
  test: z.enum(["ACT", "SAT"]),
  currentComposite: z.number().int().nullable(),
  targetComposite: z.number().int(),
  rows: z.array(
    z.strictObject({
      collegeId: z.string(),
      collegeName: z.string(),
      currentTierLabel: z.string().nullable(),
      targetTierLabel: z.string().nullable(),
      annualDeltaUsd: Usd,
      fourYearDeltaUsd: Usd,
    }),
  ),
  totalFourYearDeltaUsd: Usd,
});
export type RetakeAnalysis = z.infer<typeof RetakeAnalysis>;

export const StudySession = z.strictObject({
  title: z.string().min(1).max(120),
  minutes: z.number().int().min(10).max(240),
  weekStart: IsoDate,
  dueOn: IsoDate.nullable(),
});
export type StudySession = z.infer<typeof StudySession>;

export const StudyPlanInput = z.strictObject({ sessions: z.array(StudySession).min(1).max(40) });
export type StudyPlanInput = z.infer<typeof StudyPlanInput>;
