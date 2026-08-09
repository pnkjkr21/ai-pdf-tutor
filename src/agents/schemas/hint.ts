import { z } from "zod";

/** Max hints shown per incorrect question (includes the first hint from submit). */
export const MAX_HINTS_PER_QUESTION = 8;

export const hintLlmSchema = z.object({
  hint: z.string().trim().min(20).max(800),
});

export type HintLlmOutput = z.infer<typeof hintLlmSchema>;

export const hintRequestSchema = z.object({
  previousHints: z
    .array(z.string().trim().min(1).max(800))
    .max(MAX_HINTS_PER_QUESTION)
    .optional()
    .default([]),
});

export type HintRequest = z.infer<typeof hintRequestSchema>;

export const hintResponseSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  questionId: z.string(),
  hint: z.string(),
});
