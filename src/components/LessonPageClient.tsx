"use client";

import Link from "next/link";
import { useState } from "react";

import { LessonPlanPanel } from "@/components/LessonPlanPanel";

export function LessonPageClient({ lessonId }: { lessonId: string }) {
  const [quizActive, setQuizActive] = useState(false);

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="w-fit text-sm text-teal-800 underline-offset-4 hover:underline"
        >
          ← Back to upload
        </Link>
        <p className="text-sm font-medium tracking-wide text-[var(--accent)]">
          AI PDF Tutor
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          {quizActive ? "Quiz" : "Human-in-the-loop lesson plan"}
        </h1>
        {!quizActive ? (
          <p className="text-stone-600">
            Generate a plan, approve it, generate MCQs, then play the quiz one
            question at a time. When you finish, a performance report with study
            tips appears on this page.
          </p>
        ) : null}
      </header>

      <LessonPlanPanel
        lessonId={lessonId}
        onQuizActiveChange={setQuizActive}
      />
    </>
  );
}
