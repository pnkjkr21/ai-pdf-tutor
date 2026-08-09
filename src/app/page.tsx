import { AppShell } from "@/components/AppShell";
import { PdfUploader } from "@/components/PdfUploader";

export default function HomePage() {
  return (
    <AppShell>
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-[var(--accent)]">
          AI PDF Tutor
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
          Upload a PDF to start a lesson
        </h1>
        <p className="text-lg leading-relaxed text-[var(--muted)]">
          Parse the PDF, then review and approve an AI lesson plan before any
          quiz is generated. Earlier PDFs stay available in the side panel.
        </p>
      </header>

      <PdfUploader />
    </AppShell>
  );
}
