"use client";

export type ReviewedAttempt = {
  selectedIndex: number;
  outcome: "CORRECT" | "INCORRECT";
  isFirstAttempt: boolean;
  hintRequested: boolean;
  learnMoreRequested: boolean;
  createdAt: string;
};

export type ReviewedQuestion = {
  questionId: string;
  orderIndex: number;
  questionNumber: number;
  objectiveOrderIndex: number;
  objectiveStatement: string | null;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  attempts: ReviewedAttempt[];
  attemptCount: number;
  solvedFirstTry: boolean;
};

function choiceStyle({
  isCorrect,
  wasPicked,
  wasPickedWrong,
}: {
  isCorrect: boolean;
  wasPicked: boolean;
  wasPickedWrong: boolean;
}): string {
  if (isCorrect) {
    return "border-emerald-500 bg-emerald-50";
  }
  if (wasPickedWrong) {
    return "border-red-300 bg-red-50";
  }
  if (wasPicked) {
    return "border-stone-300 bg-stone-50";
  }
  return "border-stone-200 bg-white";
}

/**
 * Read-only view of an already-solved question: every choice the learner tried,
 * the correct one, and the explanation they unlocked. Never mutates quiz state.
 */
export function QuizReview({
  items,
  index,
  onIndexChange,
  onClose,
  questionTotal,
}: {
  items: ReviewedQuestion[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  questionTotal: number;
}) {
  const item = items[index];
  if (!item) {
    return null;
  }

  const wrongPicks = new Set(
    item.attempts.filter((a) => a.outcome === "INCORRECT").map((a) => a.selectedIndex),
  );
  const allPicks = new Set(item.attempts.map((a) => a.selectedIndex));

  return (
    <section
      aria-label="Previously answered question"
      className="flex flex-col gap-3 rounded-md border border-stone-300 bg-stone-50 px-4 py-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-stone-900">
            Reviewing question {item.questionNumber} of {questionTotal}
          </h3>
          <p className="text-xs text-stone-500">
            Answered {item.attemptCount} attempt
            {item.attemptCount === 1 ? "" : "s"} ·{" "}
            {item.solvedFirstTry ? "correct first try" : "correct after retries"}
            {item.objectiveStatement
              ? ` · objective ${item.objectiveOrderIndex + 1}`
              : ""}
          </p>
        </div>
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-700">
          {index + 1}/{items.length} reviewed
        </span>
      </header>

      {item.objectiveStatement ? (
        <p className="text-xs text-stone-500">{item.objectiveStatement}</p>
      ) : null}

      <p className="text-base font-medium text-stone-900">{item.prompt}</p>

      <ul className="flex flex-col gap-2">
        {item.choices.map((choice, choiceIndex) => {
          const isCorrect = choiceIndex === item.correctIndex;
          const wasPickedWrong = wrongPicks.has(choiceIndex);
          const wasPicked = allPicks.has(choiceIndex);

          return (
            <li
              key={`${item.questionId}-${choiceIndex}`}
              className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm text-stone-800 ${choiceStyle(
                { isCorrect, wasPicked, wasPickedWrong },
              )}`}
            >
              <span>{choice}</span>
              <span className="shrink-0 text-xs font-medium">
                {isCorrect ? (
                  <span className="text-emerald-800">
                    {wasPicked ? "✓ your answer" : "✓ correct"}
                  </span>
                ) : wasPickedWrong ? (
                  <span className="text-red-700">✕ you picked</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
        <span className="font-medium">Explanation: </span>
        {item.explanation}
      </p>

      {item.attempts.some((a) => a.hintRequested || a.learnMoreRequested) ? (
        <p className="text-xs text-stone-500">
          You used{" "}
          {[
            item.attempts.some((a) => a.hintRequested) ? "a hint" : null,
            item.attempts.some((a) => a.learnMoreRequested)
              ? "learn more"
              : null,
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          on this question.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={index >= items.length - 1}
          onClick={() => onIndexChange(index + 1)}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 disabled:opacity-40"
        >
          Next →
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          Back to current question
        </button>
      </div>
    </section>
  );
}
