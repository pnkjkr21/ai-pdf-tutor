"use client";

import type { LessonSummary } from "@/lib/types";

interface SummaryCardProps {
  summary: LessonSummary;
  onRestart: () => void;
}

export function SummaryCard({ summary, onRestart }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
        Lesson complete
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-stone-900">
        Score: {summary.scorePercent}%
      </h2>
      <p className="mt-2 text-sm text-stone-600">{summary.narrative}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Questions" value={String(summary.totalQuestions)} />
        <Stat
          label="First-try correct"
          value={String(summary.correctFirstTry)}
        />
        <Stat label="Score" value={`${summary.scorePercent}%`} />
      </div>

      {summary.strongObjectives.length > 0 && (
        <Section title="Strong areas" items={summary.strongObjectives} tone="good" />
      )}
      {summary.weakObjectives.length > 0 && (
        <Section title="Review next" items={summary.weakObjectives} tone="warn" />
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-stone-900">Study tips</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
          {summary.studyTips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mt-6 rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
      >
        Start another PDF
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "warn";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-100 bg-emerald-50 text-emerald-900"
      : "border-amber-100 bg-amber-50 text-amber-900";
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 ${cls}`}>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
