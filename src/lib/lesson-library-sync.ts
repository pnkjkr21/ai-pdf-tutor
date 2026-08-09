/** Browser event so the sidebar can refresh after quiz/plan mutations. */
export const LESSON_LIBRARY_CHANGED_EVENT =
  "ai-pdf-tutor:lesson-library-changed";

export function notifyLessonLibraryChanged(lessonId?: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(LESSON_LIBRARY_CHANGED_EVENT, {
      detail: { lessonId },
    }),
  );
}
