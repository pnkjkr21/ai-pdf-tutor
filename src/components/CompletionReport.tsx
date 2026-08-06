"use client";

import { useEffect, useState, useTransition } from "react";

type ObjectiveArea = {
  objectiveId: string;
  orderIndex: number;
  statement: string;
  questionCount: number;
  firstAttemptCorrect: number;
  incorrectAttempts: number;
  firstAttemptAccuracy: number;
};

type CompletionReportData = {
  metrics: {
    objectivesCompleted: number;
    objectivesTotal: number;
    questionsCompleted: number;
    questionsTotal: number;
    firstAttemptCorrect: number;
    firstAttemptAccuracy: number;
    totalAttempts: number;
    retries: number;
    strongAreas: ObjectiveArea[];
    weakAreas: ObjectiveArea[];
  };
  studyTips: {
    overview: string;
    tips: string[];
  };
  generatedAt: string;
};

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function AreaList({
  title,
  areas,
  empty,
}: {
  title: string;
  areas: ObjectiveArea[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      {areas.length === 0 ? (
        <p className="mt-1 text-sm text-stone-500">{empty}</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-800">
          {areas.map((a) => (
            <li key={a.objectiveId}>
              {a.statement}{" "}
              <span className="text-stone-500">
                (first-try {pct(a.firstAttemptAccuracy)}
                {a.incorrectAttempts > 0
                  ? ` · ${a.incorrectAttempts} miss${a.incorrectAttempts === 1 ? "" : "es"}`
                  : ""}
                )
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompletionReport({ lessonId }: { lessonId: string }) {
  const [report, setReport] = useState<CompletionReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(force: boolean) {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/lessons/${lessonId}/report`, {
          method: force ? "POST" : "GET",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          report?: CompletionReportData;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load completion report");
        }
        if (!json.report) {
          throw new Error("Report payload missing");
        }
        setReport(json.report);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    });
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per lessonId
  }, [lessonId]);

  const m = report?.metrics;

  return (
    <section className="flex w-full flex-col gap-4 rounded-md border border-teal-200 bg-teal-50/40 px-4 py-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-stone-900">
          Completion report
        </h2>
        <p className="text-sm text-stone-600">
          Metrics are computed from your attempts. Study tips are personalized
          from the PDF and your strong/weak objectives.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {isPending && !report ? (
        <p className="text-sm text-stone-500">Building your report…</p>
      ) : null}

      {m ? (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-stone-500">Objectives completed</dt>
              <dd className="font-medium text-stone-900">
                {m.objectivesCompleted}/{m.objectivesTotal}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Questions completed</dt>
              <dd className="font-medium text-stone-900">
                {m.questionsCompleted}/{m.questionsTotal}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">First-attempt accuracy</dt>
              <dd className="font-medium text-stone-900">
                {pct(m.firstAttemptAccuracy)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Retries</dt>
              <dd className="font-medium text-stone-900">{m.retries}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Total attempts</dt>
              <dd className="font-medium text-stone-900">{m.totalAttempts}</dd>
            </div>
          </dl>

          <AreaList
            title="Strong areas"
            areas={m.strongAreas}
            empty="No objectives met the strong-area threshold."
          />
          <AreaList
            title="Weak areas"
            areas={m.weakAreas}
            empty="No weak areas — great first-try consistency."
          />

          {report?.studyTips ? (
            <div className="rounded-md border border-stone-200 bg-white px-3 py-3">
              <h3 className="text-sm font-semibold text-stone-900">
                Study tips
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-800">
                {report.studyTips.overview}
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-stone-800">
                {report.studyTips.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {report?.generatedAt ? (
            <p className="text-xs text-stone-500">
              Generated {new Date(report.generatedAt).toLocaleString()}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => load(true)}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50 hover:bg-stone-50"
        >
          {isPending ? "Refreshing…" : "Regenerate tips"}
        </button>
      </div>
    </section>
  );
}
