import { z } from "zod";

export const difficultySchema = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
]);

/** Structured LLM lesson-plan output (3–6 teachable objectives). */
export const lessonPlanLlmSchema = z.object({
  title: z.string().trim().min(3).max(200),
  difficulty: difficultySchema,
  summary: z.string().trim().max(1000).optional().nullable(),
  objectives: z
    .array(z.string().trim().min(8).max(500))
    .min(3)
    .max(6),
});

export type LessonPlanLlmOutput = z.infer<typeof lessonPlanLlmSchema>;

/** User edits while plan is pending approval. */
export const lessonPlanEditSchema = z.object({
  title: z.string().trim().min(3).max(200),
  difficulty: difficultySchema,
  summary: z.string().trim().max(1000).nullable().optional(),
  objectives: z
    .array(z.string().trim().min(8).max(500))
    .min(3)
    .max(6),
});

export type LessonPlanEditInput = z.infer<typeof lessonPlanEditSchema>;

export const planClientSchema = z.object({
  title: z.string(),
  difficulty: difficultySchema,
  summary: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  objectives: z.array(
    z.object({
      id: z.string(),
      orderIndex: z.number().int().nonnegative(),
      statement: z.string(),
    }),
  ),
});

export const lessonPlanResponseSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  status: z.string(),
  title: z.string().nullable(),
  difficulty: difficultySchema.nullable(),
  plan: planClientSchema.nullable(),
  message: z.string().optional(),
});

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  code: z.string(),
});

export type LessonPlanResponse = z.infer<typeof lessonPlanResponseSchema>;

/** Preset regenerate goals (no free-text). */
export const planRegenerateGoalSchema = z.enum([
  "easier",
  "more_challenging",
  "deeper_coverage",
]);

export type PlanRegenerateGoal = z.infer<typeof planRegenerateGoalSchema>;

export const planRegenerateRequestSchema = z.object({
  goal: planRegenerateGoalSchema,
});

export type PlanRegenerateRequest = z.infer<typeof planRegenerateRequestSchema>;

export const PLAN_REGENERATE_GOALS: Array<{
  id: PlanRegenerateGoal;
  label: string;
  /** Instruction injected into the LLM regenerate prompt. */
  instruction: string;
}> = [
  {
    id: "easier",
    label: "Make it easier",
    instruction:
      "Make the plan easier: prefer BEGINNER or lower complexity, simpler vocabulary, foundational objectives, and fewer advanced applications.",
  },
  {
    id: "more_challenging",
    label: "Make it more challenging",
    instruction:
      "Make the plan more challenging: prefer INTERMEDIATE/ADVANCED where the PDF supports it, deeper analysis, synthesis, and application-heavy objectives.",
  },
  {
    id: "deeper_coverage",
    label: "Cover the PDF more deeply",
    instruction:
      "Cover the PDF more deeply: expand to more objectives (up to 6) that span important sections/themes in the PDF, with specific, text-grounded outcomes.",
  },
];

export function getPlanRegenerateGoalInstruction(
  goal: PlanRegenerateGoal,
): string {
  const found = PLAN_REGENERATE_GOALS.find((g) => g.id === goal);
  return found?.instruction ?? "";
}
