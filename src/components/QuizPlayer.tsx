"use client";

import { useEffect, useState, useTransition } from "react";

import { CompletionReport } from "@/components/CompletionReport";
import { QuizReview, type ReviewedQuestion } from "@/components/QuizReview";
import { MAX_HINTS_PER_QUESTION } from "@/agents/schemas/hint";

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
  /** Ordered hints for the current incorrect question (newest last). */
  hints: string[];
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
  hints: [],
  learnMore: null,
  progress: null,
};

type PendingAction = "submit" | "hint" | "learn-more" | "next";

const PENDING_LABEL: Record<PendingAction, string> = {
  submit: "Submitting…",
  hint: "Getting hint…",
  "learn-more": "Loading lesson…",
  next: "Loading…",
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
  const [history, setHistory] = useState<ReviewedQuestion[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [, startTransition] = useTransition();

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
      hints: [],
      learnMore: null,
      progress: json.progress,
      message: json.message,
    });
    setDraftIndex(json.phase === "unanswered" ? null : json.selectedIndex);
  }

  /** Answered-question trail. A failure here must not break quiz play. */
  async function loadHistory() {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz/history`);
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as {
        questions?: ReviewedQuestion[];
        questionTotal?: number;
      };
      setHistory(json.questions ?? []);
      setHistoryTotal(json.questionTotal ?? 0);
    } catch {
      // Review is additive; keep whatever trail we already have.
    }
  }

  useEffect(() => {
    setHistory([]);
    setReviewIndex(null);
    void loadCurrent();
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  function run(action: PendingAction, work: () => Promise<void>) {
    if (pendingAction) {
      return;
    }
    startTransition(() => {
      void (async () => {
        setPendingAction(action);
        setError(null);
        try {
          await work();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Request failed");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  const question = state.question;
  const locked = state.phase === "correct" || state.phase === "finished";
  const isReviewing = reviewIndex !== null && history.length > 0;
  const showRadios = !isReviewing && state.phase !== "finished" && question;
  const hintsAtLimit = state.hints.length >= MAX_HINTS_PER_QUESTION;
  const busy = pendingAction !== null;

  return (
    <section className="flex w-full flex-col gap-4 rounded-md border border-stone-200 bg-white px-4 py-4">
      <header className="flex flex-col gap-1">
        {state.progress ? (
          <p className="text-sm text-stone-500">
            Question {state.progress.questionPosition} of{" "}
            {state.progress.questionTotal} · Objective{" "}
            {state.progress.objectivePosition} of {state.progress.objectiveTotal}
          </p>
        ) : null}
      </header>

      {history.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <span className="text-sm text-stone-600">
            {history.length} question{history.length === 1 ? "" : "s"} answered
            so far
          </span>
          <button
            type="button"
            onClick={() =>
              setReviewIndex((current) =>
                current === null ? history.length - 1 : null,
              )
            }
            className="rounded-md border border-stone-300 bg-white px-3 py-1 text-sm font-medium text-stone-800 hover:bg-stone-100"
          >
            {isReviewing ? "Close review" : "Review previous questions"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {isReviewing ? (
        <QuizReview
          items={history}
          index={Math.min(reviewIndex, history.length - 1)}
          questionTotal={historyTotal || history.length}
          onIndexChange={setReviewIndex}
          onClose={() => setReviewIndex(null)}
        />
      ) : null}

      {!isReviewing && state.phase === "finished" ? (
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
        <fieldset className="flex flex-col gap-3" disabled={busy || locked}>
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
                    locked || busy ? "cursor-default" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={index}
                    checked={selected}
                    disabled={locked || busy}
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

      {!isReviewing && state.phase === "incorrect" && state.hints.length > 0 ? (
        <div className="flex flex-col gap-2">
          {state.hints.map((hint, index) => (
            <p
              key={`hint-${index}-${hint.slice(0, 24)}`}
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              <span className="font-medium">
                {state.hints.length === 1 ? "Hint: " : `Hint ${index + 1}: `}
              </span>
              {hint}
            </p>
          ))}
          {hintsAtLimit ? (
            <p className="text-xs text-stone-500">
              Hint limit reached ({MAX_HINTS_PER_QUESTION}). Use Retry or Learn
              more.
            </p>
          ) : null}
        </div>
      ) : null}

      {!isReviewing && state.phase === "correct" && state.explanation ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <span className="font-medium">Explanation: </span>
          {state.explanation}
        </p>
      ) : null}

      <div
        className={`flex-wrap gap-2 ${isReviewing ? "hidden" : "flex"}`}
        aria-busy={busy}
      >
        {state.phase === "unanswered" || state.phase === "incorrect" ? (
          <button
            type="button"
            disabled={busy || draftIndex === null}
            onClick={() =>
              run("submit", async () => {
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
                  hints: json.hint ? [json.hint] : [],
                  learnMore: null,
                  progress: json.progress,
                });
                setDraftIndex(json.selectedIndex);
                await loadHistory();
                await onStatusChange?.();
              })
            }
            className="disabled:cursor-not-allowed rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700 hover:cursor-pointer"
          >
            {pendingAction === "submit" ? PENDING_LABEL.submit : "Submit"}
          </button>
        ) : null}

        {state.phase === "incorrect" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setDraftIndex(null);
                setState((s) => ({
                  ...s,
                  phase: "unanswered",
                  selectedIndex: null,
                }));
              }}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Retry
            </button>
            <button
              type="button"
              disabled={busy || hintsAtLimit}
              title={
                hintsAtLimit
                  ? `Hint limit reached (${MAX_HINTS_PER_QUESTION} per question)`
                  : undefined
              }
              onClick={() =>
                run("hint", async () => {
                  if (state.hints.length >= MAX_HINTS_PER_QUESTION) {
                    return;
                  }
                  const previousHints = state.hints.slice(
                    0,
                    MAX_HINTS_PER_QUESTION,
                  );
                  const res = await fetch(
                    `/api/lessons/${lessonId}/quiz/hint`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ previousHints }),
                    },
                  );
                  const json = (await res.json()) as {
                    hint?: string;
                    error?: string;
                  };
                  if (!res.ok) {
                    throw new Error(json.error ?? "Hint failed");
                  }
                  const next = json.hint?.trim();
                  if (!next) {
                    return;
                  }
                  setState((s) => {
                    if (
                      s.hints.length >= MAX_HINTS_PER_QUESTION ||
                      s.hints.includes(next)
                    ) {
                      return s;
                    }
                    return { ...s, hints: [...s.hints, next] };
                  });
                })
              }
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === "hint"
                ? PENDING_LABEL.hint
                : hintsAtLimit
                  ? `Hint limit (${MAX_HINTS_PER_QUESTION})`
                  : "Another hint"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run("learn-more", async () => {
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
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === "learn-more"
                ? PENDING_LABEL["learn-more"]
                : "Learn more"}
            </button>
          </>
        ) : null}

        {state.phase === "correct" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run("next", async () => {
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
                  hints: [],
                  learnMore: null,
                  progress: json.progress,
                  message: json.message,
                });
                setDraftIndex(
                  json.phase === "unanswered" ? null : json.selectedIndex,
                );
                await loadHistory();
                await onStatusChange?.();
              })
            }
            className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-700"
          >
            {pendingAction === "next" ? PENDING_LABEL.next : "Next"}
          </button>
        ) : null}
      </div>

      {!isReviewing && pendingAction === "learn-more" && !state.learnMore ? (
        <p
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950"
          aria-live="polite"
        >
          Loading a short lesson from the PDF…
        </p>
      ) : null}

      {!isReviewing && state.learnMore ? (
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
            disabled={busy}
            onClick={() => {
              if (busy) return;
              setDraftIndex(null);
              setState((s) => ({
                ...s,
                phase: "unanswered",
                selectedIndex: null,
              }));
            }}
            className="mt-3 rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back to question
          </button>
        </aside>
      ) : null}
    </section>
  );
}
