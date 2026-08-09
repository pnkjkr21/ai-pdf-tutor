import { AppShell } from "@/components/AppShell";
import { LessonPageClient } from "@/components/LessonPageClient";

type PageProps = {
  params: Promise<{ lessonId: string }>;
};

export default async function LessonPage({ params }: PageProps) {
  const { lessonId } = await params;

  return (
    <AppShell activeLessonId={lessonId}>
      <LessonPageClient lessonId={lessonId} />
    </AppShell>
  );
}
