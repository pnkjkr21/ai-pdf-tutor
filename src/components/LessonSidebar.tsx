"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  relativeTime,
  shouldShowFileName,
  statusMeta,
} from "@/components/lesson-status";
import {
  LESSON_LIBRARY_CHANGED_EVENT,
} from "@/lib/lesson-library-sync";

type LessonLibraryItem = {
  lessonId: string;
  title: string;
  originalName: string | null;
  status: string;
  difficulty: string | null;
  pageCount: number | null;
  byteSize: number | null;
  objectiveCount: number;
  questionCount: number;
  questionsCompleted: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type LibraryPayload = {
  ok?: boolean;
  count?: number;
  lessons?: LessonLibraryItem[];
  error?: string;
};

function LessonRow({
  lesson,
  isActive,
  isConfirmingDelete,
  isDeleting,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  lesson: LessonLibraryItem;
  isActive: boolean;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const meta = statusMeta(lesson.status);
  const hasQuiz = lesson.questionCount > 0;
  const showFileName = shouldShowFileName(lesson.originalName, lesson.title);

  return (
    <li className="group relative">
      <Link
        href={`/lessons/${lesson.lessonId}`}
        aria-current={isActive ? "page" : undefined}
        className={`flex flex-col gap-1 rounded-md border py-2 pl-3 pr-9 transition-colors ${
          isActive
            ? "border-teal-600 bg-teal-50"
            : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
        }`}
      >
        <span className="line-clamp-2 text-sm font-medium text-stone-900">
          {lesson.title}
        </span>
        {showFileName ? (
          <span className="truncate text-xs text-stone-500">
            {lesson.originalName}
          </span>
        ) : null}
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
          >
            {meta.label}
          </span>
          {hasQuiz ? (
            <span className="text-[11px] text-stone-500">
              {lesson.questionsCompleted}/{lesson.questionCount} questions
            </span>
          ) : null}
          <span className="text-[11px] text-stone-400">
            {relativeTime(lesson.updatedAt)}
          </span>
        </span>
      </Link>

      {/* Sibling of the Link, not a child — a <button> cannot nest inside <a>.
          Always visible on touch; hover/focus reveal only from `lg` up. */}
      <button
        type="button"
        onClick={onRequestDelete}
        disabled={isDeleting}
        aria-label={`Delete lesson ${lesson.title}`}
        className="absolute right-1.5 top-1.5 rounded p-1 text-stone-400 opacity-100 transition-opacity hover:bg-stone-100 hover:text-red-700 disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4M6.5 6.5v5M9.5 6.5v5" />
        </svg>
      </button>

      {isConfirmingDelete ? (
        <div className="mt-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-2">
          <p className="text-xs text-red-900">
            Delete this lesson and its PDF? Progress and quiz history are lost.
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 hover:bg-red-800"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isDeleting}
              className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Lesson library rail. Lets the user jump between PDFs analysed earlier
 * without losing the lesson they are on (each lesson keeps its own DB state).
 */
export function LessonSidebar({ activeLessonId }: { activeLessonId?: string }) {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonLibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons", { cache: "no-store" });
      const json = (await res.json()) as LibraryPayload;
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to load lessons");
      }
      setLessons(json.lessons ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lessons");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, activeLessonId]);

  useEffect(() => {
    const onLibraryChanged = () => {
      void load();
    };
    window.addEventListener(LESSON_LIBRARY_CHANGED_EVENT, onLibraryChanged);
    return () => {
      window.removeEventListener(LESSON_LIBRARY_CHANGED_EVENT, onLibraryChanged);
    };
  }, [load]);

  const remove = useCallback(
    async (lessonId: string) => {
      setDeletingId(lessonId);
      setError(null);
      try {
        const res = await fetch(`/api/lessons/${lessonId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(json.error ?? "Failed to delete lesson");
        }
        setPendingDeleteId(null);
        if (lessonId === activeLessonId) {
          // The lesson page would 404. `replace` so Back doesn't return to it;
          // the activeLessonId change re-fires the load effect on its own.
          router.replace("/");
          return;
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete lesson");
      } finally {
        setDeletingId(null);
      }
    },
    [activeLessonId, load, router],
  );

  const needle = query.trim().toLowerCase();
  const visible = (lessons ?? []).filter((lesson) => {
    if (!needle) return true;
    return (
      lesson.title.toLowerCase().includes(needle) ||
      (lesson.originalName ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <>
      {/* Mobile toggle — the rail is hidden below `lg`. */}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="lesson-library"
        className="w-fit rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 lg:hidden"
      >
        {isOpen ? "Hide PDF library" : "Browse PDF library"}
      </button>

      <aside
        id="lesson-library"
        aria-label="Analyzed PDFs"
        className={`${
          isOpen ? "flex" : "hidden"
        } w-full shrink-0 flex-col gap-3 rounded-md border border-stone-200 bg-white/70 px-3 py-4 lg:sticky lg:top-8 lg:flex lg:max-h-[calc(100vh-4rem)] lg:w-72`}
      >
        <header className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-stone-900">
              Your PDFs
            </h2>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="text-xs text-teal-800 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Switch between lessons at any time — progress is saved per PDF.
          </p>
        </header>

        <Link
          href="/"
          className="rounded-md bg-teal-800 px-3 py-2 text-center text-sm font-medium text-white hover:bg-teal-700"
        >
          + Upload a new PDF
        </Link>

        {(lessons?.length ?? 0) > 5 ? (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            aria-label="Filter lessons by name"
            className="rounded-md border border-stone-300 px-2.5 py-1.5 text-sm"
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-800"
          >
            {error}
          </p>
        ) : null}

        {lessons === null && !error ? (
          <p className="text-xs text-stone-500">Loading lessons…</p>
        ) : null}

        {lessons !== null && lessons.length === 0 ? (
          <p className="text-xs text-stone-500">
            No PDFs yet. Upload one to start your first lesson.
          </p>
        ) : null}

        {lessons !== null && lessons.length > 0 && visible.length === 0 ? (
          <p className="text-xs text-stone-500">No lessons match “{query}”.</p>
        ) : null}

        {visible.length > 0 ? (
          <ul className="flex flex-col gap-2 overflow-y-auto lg:min-h-0">
            {visible.map((lesson) => (
              <LessonRow
                key={lesson.lessonId}
                lesson={lesson}
                isActive={lesson.lessonId === activeLessonId}
                isConfirmingDelete={pendingDeleteId === lesson.lessonId}
                isDeleting={deletingId === lesson.lessonId}
                onRequestDelete={() => setPendingDeleteId(lesson.lessonId)}
                onCancelDelete={() => setPendingDeleteId(null)}
                onConfirmDelete={() => void remove(lesson.lessonId)}
              />
            ))}
          </ul>
        ) : null}
      </aside>
    </>
  );
}
