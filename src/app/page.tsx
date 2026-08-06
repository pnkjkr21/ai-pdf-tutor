export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-[var(--accent)]">
        AI PDF Tutor
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
        Project foundation is up
      </h1>
      <p className="text-lg leading-relaxed text-[var(--muted)]">
        Step 1 skeleton: Next.js App Router, Prisma schema, and local PDF
        storage stubs. Upload, LangGraph, and quiz land in later steps.
      </p>
      <a
        href="/api/health"
        className="w-fit text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
      >
        Check health endpoint →
      </a>
    </main>
  );
}
