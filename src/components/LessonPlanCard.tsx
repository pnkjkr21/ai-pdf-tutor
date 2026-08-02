"use client";

import type { LessonPlan } from "@/lib/types";

interface LessonPlanCardProps {
  plan: LessonPlan;
  statusMessage?: string;
  onApprove: (plan: LessonPlan) => void;
  busy?: boolean;
}

export function LessonPlanCard({
  plan,
  statusMessage,
  onApprove,
  busy,
}: LessonPlanCardProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            Lesson plan · HITL approval
          </p>
          <h2 className="mt-1 text-xl font-semibold text-stone-900">
            {plan.title}
          </h2>
          <p className="mt-2 text-sm text-stone-600">{plan.summary}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium capitalize text-amber-900">
          {plan.difficulty}
        </span>
      </div>

      {statusMessage && (
        <p className="mt-3 text-xs text-stone-500">{statusMessage}</p>
      )}

      <ol className="mt-5 space-y-3">
        {plan.objectives.map((obj, idx) => (
          <li
            key={obj.id}
            className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-stone-900">
                {idx + 1}. {obj.title}
              </p>
              <span className="text-[11px] uppercase tracking-wide text-stone-500">
                {obj.difficulty}
              </span>
            </div>
            <p className="mt-1 text-sm text-stone-600">{obj.description}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(plan)}
          className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Approve plan & start quiz"}
        </button>
        <p className="self-center text-xs text-stone-500">
          Review objectives before the agent continues.
        </p>
      </div>
    </div>
  );
}
