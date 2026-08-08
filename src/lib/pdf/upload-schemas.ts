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

/**
 * The pre-existing lesson a re-upload collides with. A strict subset of
 * LessonLibraryItem so the duplicate card and the sidebar name it identically.
 */
export const duplicateLessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().min(1),
  originalName: z.string().nullable(),
  status: lessonStatusSchema,
  pageCount: z.number().int().nonnegative().nullable(),
  questionCount: z.number().int().nonnegative(),
  questionsCompleted: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * 409 body for a re-upload of byte-identical PDF bytes. Separate from
 * uploadErrorSchema (whose fields are all optional) so `duplicate` is
 * guaranteed present, and `code` is a literal the client can discriminate on.
 */
export const uploadDuplicateSchema = z.object({
  ok: z.literal(false),
  code: z.literal("DUPLICATE_PDF"),
  error: z.string(),
  duplicate: duplicateLessonSchema,
});

export type UploadSuccessPayload = z.infer<typeof uploadSuccessSchema>;
export type UploadErrorPayload = z.infer<typeof uploadErrorSchema>;
export type DuplicateLesson = z.infer<typeof duplicateLessonSchema>;
export type UploadDuplicatePayload = z.infer<typeof uploadDuplicateSchema>;

export const TEXT_PREVIEW_MAX = 280;

export function buildTextPreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= TEXT_PREVIEW_MAX) {
    return collapsed;
  }
  return `${collapsed.slice(0, TEXT_PREVIEW_MAX - 1)}…`;
}
