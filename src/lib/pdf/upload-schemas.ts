import { z } from "zod";

export const lessonStatusSchema = z.enum([
  "UPLOADED",
  "PARSED",
  "PLAN_PENDING_APPROVAL",
  "PLAN_APPROVED",
  "QUIZ_READY",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
]);

/** Safe client payload after upload/parse (no full extracted text). */
export const uploadSuccessSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string().min(1),
  status: lessonStatusSchema,
  originalName: z.string().min(1),
  pageCount: z.number().int().nonnegative().nullable(),
  textLength: z.number().int().nonnegative(),
  textPreview: z.string(),
  errorMessage: z.string().nullable(),
});

export const uploadErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  code: z.string(),
  lessonId: z.string().optional(),
  status: lessonStatusSchema.optional(),
});

export type UploadSuccessPayload = z.infer<typeof uploadSuccessSchema>;
export type UploadErrorPayload = z.infer<typeof uploadErrorSchema>;

export const TEXT_PREVIEW_MAX = 280;

export function buildTextPreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= TEXT_PREVIEW_MAX) {
    return collapsed;
  }
  return `${collapsed.slice(0, TEXT_PREVIEW_MAX - 1)}…`;
}
