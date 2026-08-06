"use client";

import { useEffect, useState, useTransition } from "react";

import { CompletionReport } from "@/components/CompletionReport";

type SafeQuestion = {
  id: string;
  orderIndex: number;
  objectiveId: string;
  objectiveOrderIndex: number;
  prompt: string;
  choices: string[];
};

type ProgressView = {
  status: string;
  questionPosition: number;
  questionTotal: number;
  objectivePosition: number;
  objectiveTotal: number;
  questionsCompleted: number;
  objectivesCompleted: number;
  firstAttemptCorrect: number;
  totalAttempts: number;
  retryCount: number;
};

type QuizState = {
  phase: "unanswered" | "incorrect" | "correct" | "finished";
  question: SafeQuestion | null;
  selectedIndex: number | null;
  explanation: string | null;
  hint: string | null;
  learnMore: {
    topicSummary: string;
    keyIdeas: string[];
    guideBack: string;
  } | null;
  progress: ProgressView | null;
  message?: string;
};

const emptyState: QuizState = {
  phase: "unanswered",
  question: null,
  selectedIndex: null,
  explanation: null,
  hint: null,
  learnMore: null,
  progress: null,
};

export function QuizPlayer({
  lessonId,
  onStatusChange,
}: {
  lessonId: string;
  onStatusChange?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<QuizState>(emptyState);
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadCurrent() {
    setError(null);
    const res = await fetch(`/api/lessons/${lessonId}/quiz/current`);
    const json = (await res.json()) as QuizState & { error?: string; ok?: boolean };
    if (!res.ok) {
      setError(json.error ?? "Failed to load quiz");
      return;
    }
    setState({
      phase: json.phase,
      question: json.question,
      selectedIndex: json.selectedIndex,
      explanation: json.explanation,
      hint: null,
      learnMore: null,
      progress: json.progress,
      message: json.message,
    });
    setDraftIndex(json.phase === "unanswered" ? null : json.selectedIndex);
  }

  useEffect(() => {
    void loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      setError(null);
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    });
  }

  const question = state.question;
  const locked = state.phase === "correct" || state.phase === "finished";
  const showRadios = state.phase !== "finished" && question;

  return (
    <section className="flex w-full flex-col gap-4 rounded-md border border-stone-200 bg-white px-4 py-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-stone-900">Quiz</h2>
        {state.progress ? (
          <p className="text-sm text-stone-500">
            Question {state.progress.questionPosition} of{" "}
            {state.progress.questionTotal} · Objective{" "}
            {state.progress.objectivePosition} of {state.progress.objectiveTotal} ·
            Completed {state.progress.questionsCompleted}/
            {state.progress.questionTotal}
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {state.phase === "finished" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
            <p className="font-medium">Lesson questions complete</p>
            <p className="mt-1">
              {state.message ??
                "Nice work. Your personalized performance report is below."}
            </p>
            {state.progress ? (
              <p className="mt-2 text-xs text-teal-900/80">
                First-attempt correct: {state.progress.firstAttemptCorrect} ·
                Attempts: {state.progress.totalAttempts} · Retries:{" "}
                {state.progress.retryCount}
              </p>
            ) : null}
          </div>
          <CompletionReport lessonId={lessonId} />
        </div>
      ) : null}

      {showRadios ? (
        <fieldset className="flex flex-col gap-3" disabled={isPending || locked}>
          <legend className="text-base font-medium text-stone-900">
            {question.prompt}
          </legend>
          <div className="flex flex-col gap-2">
            {question.choices.map((choice, index) => {
              const selected =
                (locked ? state.selectedIndex : draftIndex) === index;
              let style =
                "border-stone-300 bg-white hover:border-stone-400";
              if (state.phase === "correct" && selected) {
                style = "border-emerald-500 bg-emerald-50";
              } else if (state.phase === "incorrect" && selected) {
                style = "border-red-500 bg-red-50";
              } else if (selected) {
                style = "border-teal-600 bg-teal-50";
              }

              return (
                <label
                  key={`${question.id}-${index}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm text-stone-800 ${style} ${
                    locked ? "cursor-default" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={index}
                    checked={selected}
                    disabled={locked || isPending}
                    onChange={() => setDraftIndex(index)}
                    className="mt-1"
                  />
                  <span>{choice}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {state.phase === "incorrect" && state.hint ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="font-medium">Hint: </span>
          {state.hint}
        </p>
      ) : null}

      {state.phase === "correct" && state.explanation ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <span className="font-medium">Explanation: </span>
          {state.explanation}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {state.phase === "unanswered" || state.phase === "incorrect" ? (
          <button
            type="button"
            disabled={isPending || draftIndex === null}
            onClick={() =>
              run(async () => {
                if (!question || draftIndex === null) return;
                const res = await fetch(
                  `/api/lessons/${lessonId}/quiz/answer`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      questionId: question.id,
                      selectedIndex: draftIndex,
                    }),
                  },
                );
                const json = (await res.json()) as QuizState & {
                  error?: string;
                  outcome?: string;
                  hint?: string | null;
                  awaitingNext?: boolean;
                };
                if (!res.ok) {
                  throw new Error(json.error ?? "Submit failed");
                }
                setState({
                  phase: json.phase,
                  question: json.question,
                  selectedIndex: json.selectedIndex,
                  explanation: json.explanation,
                  hint: json.hint ?? null,
                  learnMore: null,
                  progress: json.progress,
                });
                setDraftIndex(json.selectedIndex);
                await onStatusChange?.();
              })
            }
            className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
          >
            {isPending ? "Submitting…" : "Submit"}
          </button>
        ) : null}

        {state.phase === "incorrect" ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setDraftIndex(null);
                setState((s) => ({
                  ...s,
                  phase: "unanswered",
                  selectedIndex: null,
                }));
              }}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800"
            >
              Retry
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const res = await fetch(
                    `/api/lessons/${lessonId}/quiz/hint`,
                    { method: "POST" },
                  );
                  const json = (await res.json()) as {
                    hint?: string;
                    error?: string;
                  };
                  if (!res.ok) {
                    throw new Error(json.error ?? "Hint failed");
                  }
                  setState((s) => ({ ...s, hint: json.hint ?? s.hint }));
                })
              }
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800"
            >
              Another hint
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const res = await fetch(
                    `/api/lessons/${lessonId}/quiz/learn-more`,
                    { method: "POST" },
                  );
                  const json = (await res.json()) as {
                    topicSummary?: string;
                    keyIdeas?: string[];
                    guideBack?: string;
                    error?: string;
                  };
                  if (!res.ok) {
                    throw new Error(json.error ?? "Learn more failed");
                  }
                  setState((s) => ({
                    ...s,
                    learnMore: {
                      topicSummary: json.topicSummary ?? "",
                      keyIdeas: json.keyIdeas ?? [],
                      guideBack:
                        json.guideBack ??
                        "When you’re ready, retry the question.",
                    },
                  }));
                })
              }
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800"
            >
              Learn more
            </button>
          </>
        ) : null}

        {state.phase === "correct" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const res = await fetch(
                  `/api/lessons/${lessonId}/quiz/next`,
                  { method: "POST" },
                );
                const json = (await res.json()) as QuizState & {
                  error?: string;
                  message?: string;
                };
                if (!res.ok) {
                  throw new Error(json.error ?? "Next failed");
                }
                setState({
                  phase: json.phase,
                  question: json.question,
                  selectedIndex: json.selectedIndex,
                  explanation: json.explanation,
                  hint: null,
                  learnMore: null,
                  progress: json.progress,
                  message: json.message,
                });
                setDraftIndex(
                  json.phase === "unanswered" ? null : json.selectedIndex,
                );
                await onStatusChange?.();
              })
            }
            className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
          >
            {isPending ? "Loading…" : "Next"}
          </button>
        ) : null}
      </div>

      {state.learnMore ? (
        <aside className="rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
          <p className="font-medium">Learn more</p>
          <p className="mt-2 whitespace-pre-wrap">{state.learnMore.topicSummary}</p>
          {state.learnMore.keyIdeas.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {state.learnMore.keyIdeas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sky-900/90">{state.learnMore.guideBack}</p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setDraftIndex(null);
              setState((s) => ({
                ...s,
                phase: "unanswered",
                selectedIndex: null,
              }));
            }}
            className="mt-3 rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            Back to question
          </button>
        </aside>
      ) : null}
    </section>
  );
}
