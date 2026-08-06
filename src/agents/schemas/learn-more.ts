import { z } from "zod";

export const learnMoreLlmSchema = z.object({
  topicSummary: z.string().trim().min(40).max(1200),
  keyIdeas: z.array(z.string().trim().min(8).max(240)).min(1).max(4).optional(),
});

export type LearnMoreLlmOutput = z.infer<typeof learnMoreLlmSchema>;

export const learnMoreResponseSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  questionId: z.string(),
  topicSummary: z.string(),
  keyIdeas: z.array(z.string()).optional(),
  guideBack: z.string(),
});
