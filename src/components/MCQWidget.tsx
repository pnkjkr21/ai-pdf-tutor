"use client";

import { useEffect, useState } from "react";
import type { PublicMCQ } from "@/lib/types";

interface ProgressInfo {
  objectiveIndex: number;
  objectiveTotal: number;
  questionIndex: number;
  questionTotal: number;
  objectiveTitle: string;
}

interface MCQWidgetProps {
  question: PublicMCQ;
  progress: ProgressInfo;
  feedback?: {
    correct?: boolean;
    hint?: string;
    explanation?: string | null;
    selectedChoiceId?: string;
  };
  busy?: boolean;
  onSubmit: (selectedChoiceId: string) => void;
  onContinue?: () => void;
}

export function MCQWidget({
  question,
  progress,
  feedback,
  busy,
  onSubmit,
  onContinue,
}: MCQWidgetProps) {
  const [selected, setSelected] = useState<string | null>(
    feedback?.selectedChoiceId ?? null
  );

  useEffect(() => {
    setSelected(feedback?.selectedChoiceId ?? null);
  }, [question.id, feedback?.selectedChoiceId, feedback?.correct]);

  const showResult = feedback && feedback.correct !== undefined;
  const isCorrect = feedback?.correct === true;
  const isIncorrect = feedback?.correct === false;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          Objective {progress.objectiveIndex + 1}/{progress.objectiveTotal} · Q
          {progress.questionIndex + 1}/{progress.questionTotal}
        </p>
        <p className="text-xs text-stone-500">{progress.objectiveTitle}</p>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-stone-900">
        {question.question}
      </h3>

      <fieldset className="mt-4 space-y-2" disabled={busy || isCorrect}>
        <legend className="sr-only">Answer choices</legend>
        {question.choices.map((choice) => {
          const isSelected = selected === choice.id;
          let tone =
            "border-stone-200 bg-white hover:border-teal-400 hover:bg-teal-50";
          if (showResult && isSelected && isCorrect) {
            tone = "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200";
          } else if (showResult && isSelected && isIncorrect) {
            tone = "border-red-500 bg-red-50 ring-2 ring-red-200";
          } else if (isSelected) {
            tone = "border-teal-500 bg-teal-50";
          }

          return (
            <label
              key={choice.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${tone}`}
            >
              <input
                type="radio"
                name={`mcq-${question.id}`}
                value={choice.id}
                checked={isSelected}
                onChange={() => setSelected(choice.id)}
                className="mt-1"
              />
              <span className="text-sm text-stone-800">
                <span className="mr-2 font-semibold">{choice.id}.</span>
                {choice.text}
              </span>
            </label>
          );
        })}
      </fieldset>

      {isIncorrect && feedback?.hint && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Not quite — try again</p>
          <p className="mt-1">{feedback.hint}</p>
          <p className="mt-2 text-xs text-red-700/80">
            No penalty for retries. Pick another answer when ready.
          </p>
        </div>
      )}

      {isCorrect && feedback?.explanation && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Correct</p>
          <p className="mt-1">{feedback.explanation}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!isCorrect && (
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => selected && onSubmit(selected)}
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
          >
            {busy ? "Checking…" : isIncorrect ? "Retry answer" : "Submit answer"}
          </button>
        )}
        {isCorrect && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onContinue?.()}
            className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Loading…" : "Continue lesson"}
          </button>
        )}
      </div>
    </div>
  );
}
