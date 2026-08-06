import Link from "next/link";

import { LessonPlanPanel } from "@/components/LessonPlanPanel";

type PageProps = {
  params: Promise<{ lessonId: string }>;
};

export default async function LessonPage({ params }: PageProps) {
  const { lessonId } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
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
          Human-in-the-loop lesson plan
        </h1>
        <p className="text-stone-600">
          Generate a plan, approve it, generate MCQs, then play the quiz one
          question at a time. When you finish, a performance report with study
          tips appears on this page.
        </p>
      </header>

      <LessonPlanPanel lessonId={lessonId} />
    </main>
  );
}
