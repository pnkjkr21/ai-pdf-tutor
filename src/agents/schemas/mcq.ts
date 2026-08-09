import { z } from "zod";

const choiceTupleSchema = z.tuple([
  z.string().trim().min(1).max(400),
  z.string().trim().min(1).max(400),
  z.string().trim().min(1).max(400),
  z.string().trim().min(1).max(400),
]);

export const mcqItemLlmSchema = z.object({
  objectiveOrderIndex: z.number().int().nonnegative(),
  prompt: z.string().trim().min(10).max(1000),
  choices: choiceTupleSchema,
  correctIndex: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  explanation: z.string().trim().min(10).max(2000),
});

/** Structured LLM MCQ output. Allow overshoot; domain trims to ≤2/objective and ≤12 total. */
export const mcqLlmSchema = z.object({
  questions: z.array(mcqItemLlmSchema).min(1).max(24),
});

export type McqLlmOutput = z.infer<typeof mcqLlmSchema>;
export type McqItemLlm = z.infer<typeof mcqItemLlmSchema>;

/** Safe client question — never includes correctIndex or explanation. */
export const safeQuestionSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int().nonnegative(),
  objectiveId: z.string(),
  objectiveOrderIndex: z.number().int().nonnegative(),
  prompt: z.string(),
  choices: z.array(z.string()).length(4),
});

export const quizGenerateResponseSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  status: z.string(),
  questionCount: z.number().int().nonnegative(),
  objectivesCovered: z.number().int().nonnegative(),
  objectiveCount: z.number().int().nonnegative(),
  questions: z.array(safeQuestionSchema),
  message: z.string(),
});

export type SafeQuestion = z.infer<typeof safeQuestionSchema>;
export type QuizGenerateResponse = z.infer<typeof quizGenerateResponseSchema>;
