"use client";

import { useEffect, useState, useTransition } from "react";

type SafeQuestion = {
  id: string;
  orderIndex: number;
  objectiveId: string;
  objectiveOrderIndex: number;
  prompt: string;
  choices: string[];
};

type QuizPayload = {
  ok?: boolean;
  lessonId?: string;
  status?: string;
  questionCount?: number;
  objectivesCovered?: number;
  objectiveCount?: number;
  questions?: SafeQuestion[];
  message?: string;
  error?: string;
  quiz?: {
    questionCount: number;
    objectivesCovered: number;
    objectiveCount: number;
    questions: SafeQuestion[];
  };
};

export function QuizGeneratePanel({
  lessonId,
  status,
  questionCount,
  onQuizGenerated,
}: {
  lessonId: string;
  status: string;
  questionCount: number;
  /** Refresh parent lesson payload so status flips to QUIZ_READY without a full page reload. */
  onQuizGenerated?: () => void | Promise<void>;
}) {
  const [result, setResult] = useState<QuizPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (status === "QUIZ_READY" || questionCount > 0) {
      startTransition(async () => {
        const res = await fetch(`/api/lessons/${lessonId}`);
        const json = (await res.json()) as QuizPayload;
        if (res.ok) {
          setResult({
            ok: true,
            lessonId,
            status: json.status,
            questionCount: json.quiz?.questionCount ?? json.questionCount,
            objectivesCovered: json.quiz?.objectivesCovered,
            objectiveCount: json.quiz?.objectiveCount,
            questions: json.quiz?.questions,
            message: "Quiz ready — play below.",
          });
        }
      });
    }
  }, [lessonId, status, questionCount]);

  const canGenerate = status === "PLAN_APPROVED" && questionCount === 0;
  const ready =
    result?.status === "QUIZ_READY" ||
    status === "QUIZ_READY" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED" ||
    (result?.questionCount ?? 0) > 0;

  return (
    <section className="flex w-full flex-col gap-3 rounded-md border border-stone-200 bg-stone-50 px-4 py-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-stone-900">Quiz</h2>
        <p className="text-sm text-stone-500">
          Generate MCQs from the approved plan and PDF text only (no vector DB).
          Answer keys stay server-side.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {canGenerate ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setError(null);
              const res = await fetch(
                `/api/lessons/${lessonId}/quiz/generate`,
                { method: "POST" },
              );
              const json = (await res.json()) as QuizPayload;
              if (!res.ok) {
                setError(json.error ?? "Quiz generation failed");
                return;
              }
              setResult(json);
              await onQuizGenerated?.();
            });
          }}
          className="hover:cursor-pointer disabled:cursor-not-allowed w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
        >
          {isPending ? "Generating quiz…" : "Generate quiz"}
        </button>
      ) : null}

      {ready && (result || questionCount > 0) ? (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-3 text-sm text-stone-800">
          <p className="font-medium text-teal-900">
            {result?.message ??
              `${questionCount} questions ready. Quiz UI comes in Step 5.`}
          </p>
          <dl className="mt-2 grid gap-1">
            <div>
              <dt className="inline text-stone-500">Questions: </dt>
              <dd className="inline">
                {result?.questionCount ?? questionCount}
              </dd>
            </div>
            {typeof result?.objectivesCovered === "number" ? (
              <div>
                <dt className="inline text-stone-500">Objectives covered: </dt>
                <dd className="inline">
                  {result.objectivesCovered}/{result.objectiveCount}
                </dd>
              </div>
            ) : null}
          </dl>
          {result?.questions && result.questions.length > 0 ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-stone-700">
              {result.questions.map((q) => (
                <li key={q.id}>
                  <span className="font-medium">Q{q.orderIndex + 1}: </span>
                  {q.prompt}
                  <span className="block text-xs text-stone-500">
                    objective #{q.objectiveOrderIndex} · {q.choices.length} choices
                    (answers hidden)
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="mt-3 text-xs text-stone-500">
            Use the quiz player below to answer one question at a time.
          </p>
        </div>
      ) : null}

      {!canGenerate && !ready && status !== "PLAN_APPROVED" ? (
        <p className="text-sm text-stone-500">
          Approve the lesson plan first to unlock quiz generation.
        </p>
      ) : null}
    </section>
  );
}
