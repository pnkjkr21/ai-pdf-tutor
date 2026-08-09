import { lessonRepository } from "@/db/repositories/lesson-repository";
import { PlanDomainError } from "@/domain/errors";
import type { PdfStorage } from "@/lib/pdf";
import { localPdfStorage } from "@/lib/pdf";

/**
 * Remove a lesson and its stored PDF.
 *
 * Every child row (PdfAsset, plan, objectives, questions, attempts, progress)
 * is `onDelete: Cascade`, so the single Lesson delete clears the database.
 *
 * Order is DB first, disk second, and deliberately not a transaction — Prisma
 * cannot roll back an unlink, so wrapping these would only create false
 * confidence. The asymmetry decides the order: a failed disk cleanup leaves an
 * invisible orphan directory, whereas a failed DB delete after the file was
 * already removed would leave a visibly broken lesson whose PDF is gone and
 * whose hash still blocks re-uploading it.
 */
export async function deleteLesson(
  lessonId: string,
  storage: PdfStorage = localPdfStorage,
): Promise<{ lessonId: string }> {
  const target = await lessonRepository.findDeletionTarget(lessonId);
  if (!target) {
    throw new PlanDomainError("NOT_FOUND", `Lesson not found: ${lessonId}`, 404);
  }

  await lessonRepository.deleteById(lessonId);

  try {
    await storage.deleteLessonFiles(lessonId);
  } catch (error) {
    // Best effort: the lesson is already gone from the user's perspective.
    console.error(`Orphaned PDF files for deleted lesson ${lessonId}`, error);
  }

  return { lessonId };
}
