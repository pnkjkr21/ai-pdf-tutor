import { z } from "zod";

/** LLM-only payload — validated before persist. */
export const studyTipsLlmSchema = z.object({
  overview: z.string().trim().min(40).max(800),
  tips: z
    .array(z.string().trim().min(20).max(400))
    .min(2)
    .max(6),
});

export type StudyTipsLlmOutput = z.infer<typeof studyTipsLlmSchema>;

export const objectiveAreaSchema = z.object({
  objectiveId: z.string(),
  orderIndex: z.number().int().nonnegative(),
  statement: z.string(),
  questionCount: z.number().int().nonnegative(),
  firstAttemptCorrect: z.number().int().nonnegative(),
  incorrectAttempts: z.number().int().nonnegative(),
  firstAttemptAccuracy: z.number().min(0).max(1),
});

export const completionMetricsSchema = z.object({
  objectivesCompleted: z.number().int().nonnegative(),
  objectivesTotal: z.number().int().nonnegative(),
  questionsCompleted: z.number().int().nonnegative(),
  questionsTotal: z.number().int().nonnegative(),
  firstAttemptCorrect: z.number().int().nonnegative(),
  firstAttemptAccuracy: z.number().min(0).max(1),
  totalAttempts: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  strongAreas: z.array(objectiveAreaSchema),
  weakAreas: z.array(objectiveAreaSchema),
});

export type CompletionMetrics = z.infer<typeof completionMetricsSchema>;

export const completionReportSchema = z.object({
  metrics: completionMetricsSchema,
  studyTips: studyTipsLlmSchema,
  generatedAt: z.string(),
});

export type CompletionReport = z.infer<typeof completionReportSchema>;

export const completionReportResponseSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  status: z.literal("COMPLETED"),
  report: completionReportSchema,
  regenerated: z.boolean(),
});
