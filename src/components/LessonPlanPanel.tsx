"use client";

import { useEffect, useState, useTransition } from "react";

import { QuizPlayer } from "@/components/QuizPlayer";
import { notifyLessonLibraryChanged } from "@/lib/lesson-library-sync";
import {
  PLAN_REGENERATE_GOALS,
  type PlanRegenerateGoal,
} from "@/agents/schemas/lesson-plan";

type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

type PlanObjective = {
  id: string;
  orderIndex: number;
  statement: string;
};

type PlanPayload = {
  ok: boolean;
  lessonId: string;
  status: string;
  title: string | null;
  difficulty: Difficulty | null;
  plan: {
    title: string;
    difficulty: Difficulty;
    summary: string | null;
    approvedAt: string | null;
    objectives: PlanObjective[];
  } | null;
  questionCount?: number;
  message?: string;
  error?: string;
};

type Draft = {
  title: string;
  difficulty: Difficulty;
  summary: string;
  objectives: Array<{ key: string; statement: string }>;
};

function newObjectiveKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `obj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDraft(): Draft {
  return {
    title: "",
    difficulty: "BEGINNER",
    summary: "",
    objectives: [
      { key: newObjectiveKey(), statement: "" },
      { key: newObjectiveKey(), statement: "" },
      { key: newObjectiveKey(), statement: "" },
    ],
  };
}

function draftFromPlan(plan: NonNullable<PlanPayload["plan"]>): Draft {
  return {
    title: plan.title,
    difficulty: plan.difficulty,
    summary: plan.summary ?? "",
    objectives: plan.objectives.map((o) => ({
      key: o.id,
      statement: o.statement,
    })),
  };
}

function moveObjective<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function isDraftDirty(
  draft: Draft,
  plan: NonNullable<PlanPayload["plan"]> | null | undefined,
): boolean {
  if (!plan) {
    return false;
  }
  if (draft.title.trim() !== plan.title.trim()) {
    return true;
  }
  if (draft.difficulty !== plan.difficulty) {
    return true;
  }
  if ((draft.summary.trim() || "") !== (plan.summary?.trim() || "")) {
    return true;
  }
  const draftObjectives = draft.objectives.map((o) => o.statement.trim());
  const planObjectives = plan.objectives.map((o) => o.statement.trim());
  if (draftObjectives.length !== planObjectives.length) {
    return true;
  }
  return draftObjectives.some((statement, i) => statement !== planObjectives[i]);
}

export function LessonPlanPanel({
  lessonId,
  onQuizActiveChange,
}: {
  lessonId: string;
  /** Called when the student enters/leaves the active quiz UI. */
  onQuizActiveChange?: (active: boolean) => void;
}) {
  const [payload, setPayload] = useState<PlanPayload | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editingObjectiveKey, setEditingObjectiveKey] = useState<string | null>(
    null,
  );
  const [objectiveModalText, setObjectiveModalText] = useState("");
  const [objectiveModalBaseline, setObjectiveModalBaseline] = useState("");
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateGoal, setRegenerateGoal] =
    useState<PlanRegenerateGoal | null>(null);
  /** User must click Start quiz before questions appear (except resume/complete). */
  const [quizStarted, setQuizStarted] = useState(false);

  function applyPayload(data: PlanPayload) {
    setPayload(data);
    if (data.plan) {
      setDraft(draftFromPlan(data.plan));
    }
    notifyLessonLibraryChanged(lessonId);
  }

  async function loadLesson() {
    setError(null);
    const res = await fetch(`/api/lessons/${lessonId}`);
    const json = (await res.json()) as PlanPayload;
    if (!res.ok) {
      setError(json.error ?? "Failed to load lesson");
      return;
    }
    applyPayload(json);
  }

  useEffect(() => {
    void loadLesson();
    setQuizStarted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per lessonId
  }, [lessonId]);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      setError(null);
      setInfo(null);
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    });
  }

  const status = payload?.status;
  const canGenerate = status === "PARSED";
  const canEdit =
    status === "PLAN_PENDING_APPROVAL" && payload?.plan && !payload.plan.approvedAt;
  const draftDirty = canEdit ? isDraftDirty(draft, payload.plan) : false;
  const editingObjectiveIndex =
    editingObjectiveKey === null
      ? -1
      : draft.objectives.findIndex((o) => o.key === editingObjectiveKey);
  const editingObjective =
    editingObjectiveIndex >= 0 ? draft.objectives[editingObjectiveIndex] : null;
  const objectiveModalDirty =
    objectiveModalText.trim() !== objectiveModalBaseline.trim();

  useEffect(() => {
    // Resume an in-progress or finished quiz without requiring Start again.
    if (status === "IN_PROGRESS" || status === "COMPLETED") {
      setQuizStarted(true);
    }
  }, [status]);

  function openObjectiveModal(key: string, statement: string) {
    if (isPending) {
      return;
    }
    setEditingObjectiveKey(key);
    setObjectiveModalText(statement);
    setObjectiveModalBaseline(statement);
  }

  function closeObjectiveModal() {
    setEditingObjectiveKey(null);
    setObjectiveModalText("");
    setObjectiveModalBaseline("");
  }

  function applyObjectiveModal() {
    if (!editingObjectiveKey || !objectiveModalDirty) {
      return;
    }
    const key = editingObjectiveKey;
    const nextValue = objectiveModalText;
    setDraft((d) => ({
      ...d,
      objectives: d.objectives.map((o) =>
        o.key === key ? { ...o, statement: nextValue } : o,
      ),
    }));
    closeObjectiveModal();
  }

  useEffect(() => {
    if (!editingObjectiveKey) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeObjectiveModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingObjectiveKey]);

  const showApprovedPlan =
    Boolean(payload?.plan) &&
    (status === "PLAN_APPROVED" ||
      status === "QUIZ_READY" ||
      status === "IN_PROGRESS" ||
      status === "COMPLETED");
  const canStartQuiz =
    status === "PLAN_APPROVED" ||
    (status === "QUIZ_READY" && !quizStarted);
  const showQuizPlayer =
    quizStarted &&
    (status === "QUIZ_READY" ||
      status === "IN_PROGRESS" ||
      status === "COMPLETED");

  useEffect(() => {
    onQuizActiveChange?.(showQuizPlayer);
  }, [showQuizPlayer, onQuizActiveChange]);

  return (
    <section className="flex w-full flex-col gap-4 rounded-md border border-stone-200 bg-white px-4 py-4">
      {!showQuizPlayer ? (
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-stone-900">Lesson plan</h2>
          {status !== "PLAN_APPROVED" && <p className="text-sm text-stone-500">
            Click here to generate a lesson plan.
          </p>}
        </header>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {!showQuizPlayer && info ? (
        <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">{info}</p>
      ) : null}

      {canGenerate ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const res = await fetch(
                `/api/lessons/${lessonId}/plan/generate`,
                { method: "POST" },
              );
              const json = (await res.json()) as PlanPayload;
              if (!res.ok) {
                throw new Error(json.error ?? "Generate failed");
              }
              applyPayload(json);
              setInfo("Plan proposed — review and approve when ready.");
            })
          }
          className="hover:cursor-pointer disabled:cursor-not-allowed w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
        >
          {isPending ? "Generating…" : "Generate lesson plan"}
        </button>
      ) : null}

      {canEdit ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const res = await fetch(`/api/lessons/${lessonId}/plan`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: draft.title,
                  difficulty: draft.difficulty,
                  summary: draft.summary || null,
                  objectives: draft.objectives
                    .map((o) => o.statement.trim())
                    .filter(Boolean),
                }),
              });
              const json = (await res.json()) as PlanPayload;
              if (!res.ok) {
                throw new Error(json.error ?? "Save failed");
              }
              applyPayload(json);
              setInfo("Edits saved. Plan is still pending approval.");
            });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Title</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="rounded-md border border-stone-300 px-3 py-2 disabled:cursor-not-allowed"
              required
              minLength={3}
              disabled
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">
              Difficulty{" "}
              <span className="font-normal text-stone-500">
                (controls how hard quiz questions and answer choices will be)
              </span>
            </span>
            <select
              value={draft.difficulty}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  difficulty: e.target.value as Difficulty,
                }))
              }
              className="hover:cursor-pointer w-full appearance-none rounded-md border border-stone-300 bg-white py-2 pl-3 pr-10"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378716c'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.75rem center",
                backgroundSize: "1rem",
              }}
            >
              <option value="BEGINNER">
                BEGINNER
              </option>
              <option value="INTERMEDIATE">
                INTERMEDIATE
              </option>
              <option value="ADVANCED">
                ADVANCED
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Summary</span>
            <textarea
              value={draft.summary}
              disabled
              onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              className="min-h-20 rounded-md border border-stone-300 px-3 py-2 disabled:cursor-not-allowed"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">
                Objectives:
              </span>
              <button
                type="button"
                disabled={isPending || draft.objectives.length >= 6}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    objectives: [
                      ...d.objectives,
                      { key: newObjectiveKey(), statement: "" },
                    ],
                  }))
                }
                className="text-sm text-teal-800 disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-stone-500">
              Drag the handle to reorder objectives.
            </p>
            {draft.objectives.map((objective, index) => (
              <div
                key={objective.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragIndex === null || dragIndex === index || isPending) {
                    return;
                  }
                  setDraft((d) => ({
                    ...d,
                    objectives: moveObjective(d.objectives, dragIndex, index),
                  }));
                  setDragIndex(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragIndex(null);
                }}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                  dragIndex === index
                    ? "border-teal-400 bg-teal-50/80 opacity-80"
                    : "border-transparent"
                }`}
              >
                <button
                  type="button"
                  draggable={!isPending}
                  disabled={isPending}
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", objective.key);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                  }}
                  className="cursor-grab touch-none select-none px-1 text-lg leading-none text-stone-400 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Drag to reorder objective ${index + 1}`}
                  title="Drag to reorder"
                >
                  ⋮⋮
                </button>
                <input
                  value={objective.statement}
                  readOnly
                  onClick={() =>
                    openObjectiveModal(objective.key, objective.statement)
                  }
                  onFocus={(e) => {
                    e.target.blur();
                    openObjectiveModal(objective.key, objective.statement);
                  }}
                  className="flex-1 cursor-pointer truncate rounded-md border border-stone-300 bg-white px-3 py-2 text-left text-sm hover:border-stone-400"
                  placeholder={`Objective ${index + 1}`}
                  required
                  minLength={8}
                  title="Click to view and edit full objective"
                  aria-label={`Objective ${index + 1}. Click to edit full text.`}
                />
                <button
                  type="button"
                  disabled={isPending || draft.objectives.length <= 3}
                  onClick={() => {
                    const key = objective.key;
                    setDraft((d) => ({
                      ...d,
                      objectives: d.objectives.filter((o) => o.key !== key),
                    }));
                    if (editingObjectiveKey === key) {
                      closeObjectiveModal();
                    }
                  }}
                  className="rounded px-1.5 py-1 text-sm text-stone-500 hover:cursor-pointer hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-500"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending || !draftDirty}
              title={draftDirty ? undefined : "No changes to save"}
              className="hover:cursor-pointer disabled:cursor-not-allowed rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
            >
              Save edits
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setRegenerateGoal(null);
                setRegenerateOpen(true);
              }}
              className="hover:cursor-pointer disabled:cursor-not-allowed rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
            >
              Regenerate
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const res = await fetch(
                    `/api/lessons/${lessonId}/plan/approve`,
                    { method: "POST" },
                  );
                  const json = (await res.json()) as PlanPayload;
                  if (!res.ok) {
                    throw new Error(json.error ?? "Approve failed");
                  }
                  applyPayload(json);
                  setInfo(
                    json.message ??
                      "Plan approved — quiz generation comes next.",
                  );
                })
              }
              className="hover:cursor-pointer disabled:cursor-not-allowed rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
            >
              Approve plan
            </button>
          </div>
        </form>
      ) : null}

      {showApprovedPlan && payload?.plan && !showQuizPlayer ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 text-sm text-stone-800">
            <p className="font-medium text-teal-900">
              {status === "PLAN_APPROVED" ? "Plan approved" : "Approved plan"}
            </p>
            <p>
              <span className="text-stone-500">Title: </span>
              {payload.plan.title}
            </p>
            <p>
              <span className="text-stone-500">Difficulty: </span>
              {payload.plan.difficulty}
            </p>
            {payload.plan.summary ? (
              <p>
                <span className="text-stone-500">Summary: </span>
                {payload.plan.summary}
              </p>
            ) : null}
            <ol className="list-decimal space-y-1 pl-5">
              {payload.plan.objectives.map((o) => (
                <li key={o.id}>{o.statement}</li>
              ))}
            </ol>
          </div>

          {canStartQuiz ? (
            <div className="flex justify-center py-6">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const needsGenerate = status === "PLAN_APPROVED";
                    if (needsGenerate) {
                      const res = await fetch(
                        `/api/lessons/${lessonId}/quiz/generate`,
                        { method: "POST" },
                      );
                      const json = (await res.json()) as {
                        error?: string;
                        message?: string;
                      };
                      if (!res.ok) {
                        throw new Error(json.error ?? "Quiz generation failed");
                      }
                      await loadLesson();
                    }
                    setInfo(null);
                    setQuizStarted(true);
                  })
                }
                className="hover:cursor-pointer disabled:cursor-not-allowed rounded-md bg-teal-800 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
              >
                {isPending
                  ? status === "PLAN_APPROVED"
                    ? "Preparing quiz…"
                    : "Starting…"
                  : "Start Quiz"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showQuizPlayer ? (
        <QuizPlayer lessonId={lessonId} onStatusChange={loadLesson} />
      ) : null}

      {!payload && !error ? (
        <p className="text-sm text-stone-500">Loading lesson…</p>
      ) : null}

      {editingObjective && editingObjectiveIndex >= 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeObjectiveModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="objective-edit-title"
            className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                id="objective-edit-title"
                className="text-base font-semibold text-stone-900"
              >
                Objective {editingObjectiveIndex + 1}
              </h3>
              <button
                type="button"
                onClick={closeObjectiveModal}
                className="rounded px-2 py-1 text-sm text-stone-500 hover:cursor-pointer hover:bg-stone-100 hover:text-stone-800"
              >
                Close
              </button>
            </div>
            <textarea
              autoFocus
              value={objectiveModalText}
              onChange={(e) => setObjectiveModalText(e.target.value)}
              className="min-h-40 w-full rounded-md border border-stone-300 px-3 py-2 text-sm leading-relaxed text-stone-900"
              placeholder="Write the full learning objective…"
              minLength={8}
            />
            <p className="text-xs text-stone-500">
              Click Done to apply this text to the objective. Then use Save edits
              to persist to the server.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeObjectiveModal}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:cursor-pointer hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!objectiveModalDirty}
                title={
                  objectiveModalDirty ? undefined : "No changes to apply"
                }
                onClick={applyObjectiveModal}
                className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:cursor-pointer hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {regenerateOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              setRegenerateOpen(false);
              setRegenerateGoal(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regenerate-plan-title"
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="regenerate-plan-title"
                  className="text-base font-semibold text-stone-900"
                >
                  What needs to change?
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  Pick one option. We&apos;ll revise the plan with that goal in
                  mind.
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setRegenerateOpen(false);
                  setRegenerateGoal(null);
                }}
                className="rounded px-2 py-1 text-sm text-stone-500 hover:cursor-pointer hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <fieldset className="flex flex-col gap-2" disabled={isPending}>
              <legend className="sr-only">Regenerate goal</legend>
              {PLAN_REGENERATE_GOALS.map((goal) => (
                <label
                  key={goal.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm text-stone-800 ${
                    regenerateGoal === goal.id
                      ? "border-teal-600 bg-teal-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="regenerate-goal"
                    value={goal.id}
                    checked={regenerateGoal === goal.id}
                    onChange={() => setRegenerateGoal(goal.id)}
                    className="mt-0.5"
                  />
                  <span>{goal.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setRegenerateOpen(false);
                  setRegenerateGoal(null);
                }}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:cursor-pointer hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !regenerateGoal}
                title={
                  regenerateGoal ? undefined : "Choose what you want to change"
                }
                onClick={() => {
                  if (!regenerateGoal) {
                    return;
                  }
                  const goal = regenerateGoal;
                  run(async () => {
                    const res = await fetch(
                      `/api/lessons/${lessonId}/plan/regenerate`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ goal }),
                      },
                    );
                    const json = (await res.json()) as PlanPayload;
                    if (!res.ok) {
                      throw new Error(json.error ?? "Regenerate failed");
                    }
                    applyPayload(json);
                    setRegenerateOpen(false);
                    setRegenerateGoal(null);
                    setInfo(
                      "Plan revised using your selected goal. Still pending approval.",
                    );
                  });
                }}
                className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:cursor-pointer hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Regenerating…" : "Regenerate plan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
