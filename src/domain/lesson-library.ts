import type { Difficulty, LessonStatus } from "@prisma/client";

import {
  lessonRepository,
  type LessonSummaryRow,
} from "@/db/repositories/lesson-repository";

export const LESSON_LIBRARY_LIMIT = 50;

/** One entry in the side panel. Safe by construction: no PDF text, no answer keys. */
export type LessonLibraryItem = {
  lessonId: string;
  title: string;
  originalName: string | null;
  status: LessonStatus;
  difficulty: Difficulty | null;
  pageCount: number | null;
  byteSize: number | null;
  objectiveCount: number;
  questionCount: number;
  questionsCompleted: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Display label for a lesson before the plan (and therefore the title) exists.
 * Falls back to the PDF filename, then the id.
 */
function displayTitle(lesson: LessonSummaryRow): string {
  const planTitle = lesson.title?.trim();
  if (planTitle) {
    return planTitle;
  }
  const fileName = lesson.pdfAsset?.originalName?.trim();
  if (fileName) {
    return fileName.replace(/\.pdf$/i, "");
  }
  return `Lesson ${lesson.id.slice(-6)}`;
}

/**
 * Shared by the sidebar and the duplicate-upload 409 so both name a lesson
 * with the exact same `displayTitle` string.
 */
export function toLibraryItem(lesson: LessonSummaryRow): LessonLibraryItem {
  return {
    lessonId: lesson.id,
    title: displayTitle(lesson),
    originalName: lesson.pdfAsset?.originalName ?? null,
    status: lesson.status,
    difficulty: lesson.difficulty,
    pageCount: lesson.pdfAsset?.pageCount ?? null,
    byteSize: lesson.pdfAsset?.byteSize ?? null,
    objectiveCount: lesson._count.objectives,
    questionCount: lesson._count.questions,
    questionsCompleted: lesson.progress?.questionsCompleted ?? 0,
    completedAt: lesson.progress?.completedAt?.toISOString() ?? null,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
  };
}

export async function listLessonLibrary(limit = LESSON_LIBRARY_LIMIT) {
  const rows = await lessonRepository.listSummaries(limit);
  return {
    ok: true as const,
    count: rows.length,
    lessons: rows.map(toLibraryItem),
  };
}
