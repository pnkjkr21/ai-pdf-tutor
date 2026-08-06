import { z } from "zod";

export const hintLlmSchema = z.object({
  hint: z.string().trim().min(20).max(800),
});

export type HintLlmOutput = z.infer<typeof hintLlmSchema>;

export const hintResponseSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  questionId: z.string(),
  hint: z.string(),
});
