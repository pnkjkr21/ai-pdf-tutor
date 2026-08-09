import type { ReactNode } from "react";

import { LessonSidebar } from "@/components/LessonSidebar";

/**
 * Two-column page frame: lesson library rail + page content.
 * The rail stacks above the content below `lg` and is collapsed by default there.
 */
export function AppShell({
  activeLessonId,
  children,
}: {
  activeLessonId?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start lg:gap-8 lg:py-12">
      <LessonSidebar activeLessonId={activeLessonId} />
      <main className="flex min-w-0 flex-1 flex-col gap-8">{children}</main>
    </div>
  );
}
