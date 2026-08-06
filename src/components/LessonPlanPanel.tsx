"use client";

import { useEffect, useState, useTransition } from "react";

import { QuizGeneratePanel } from "@/components/QuizGeneratePanel";
import { QuizPlayer } from "@/components/QuizPlayer";

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
  objectives: string[];
};

function emptyDraft(): Draft {
  return {
    title: "",
    difficulty: "BEGINNER",
    summary: "",
    objectives: ["", "", ""],
  };
}

function draftFromPlan(plan: NonNullable<PlanPayload["plan"]>): Draft {
  return {
    title: plan.title,
    difficulty: plan.difficulty,
    summary: plan.summary ?? "",
    objectives: plan.objectives.map((o) => o.statement),
  };
}

export function LessonPlanPanel({ lessonId }: { lessonId: string }) {
  const [payload, setPayload] = useState<PlanPayload | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyPayload(data: PlanPayload) {
    setPayload(data);
    if (data.plan) {
      setDraft(draftFromPlan(data.plan));
    }
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
  const showApprovedPlan =
    Boolean(payload?.plan) &&
    (status === "PLAN_APPROVED" ||
      status === "QUIZ_READY" ||
      status === "IN_PROGRESS" ||
      status === "COMPLETED");
  const showQuizPanel =
    status === "PLAN_APPROVED" ||
    status === "QUIZ_READY" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED" ||
    (payload?.questionCount ?? 0) > 0;
  const showQuizPlayer =
    status === "QUIZ_READY" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED";

  return (
    <section className="flex w-full flex-col gap-4 rounded-md border border-stone-200 bg-white px-4 py-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-stone-900">Lesson plan</h2>
        <p className="text-sm text-stone-500">
          Review, edit, regenerate, or approve. Quiz generation stays locked until
          approval (Step 4).
        </p>
        {payload ? (
          <p className="font-mono text-xs text-stone-500">
            {payload.lessonId} · {payload.status}
            {typeof payload.questionCount === "number"
              ? ` · questions: ${payload.questionCount}`
              : null}
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
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
          className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
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
                  objectives: draft.objectives.map((s) => s.trim()).filter(Boolean),
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
              className="rounded-md border border-stone-300 px-3 py-2"
              required
              minLength={3}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Difficulty</span>
            <select
              value={draft.difficulty}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  difficulty: e.target.value as Difficulty,
                }))
              }
              className="rounded-md border border-stone-300 px-3 py-2"
            >
              <option value="BEGINNER">BEGINNER</option>
              <option value="INTERMEDIATE">INTERMEDIATE</option>
              <option value="ADVANCED">ADVANCED</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Summary (optional)</span>
            <textarea
              value={draft.summary}
              onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              className="min-h-20 rounded-md border border-stone-300 px-3 py-2"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">
                Objectives (3–6)
              </span>
              <button
                type="button"
                disabled={isPending || draft.objectives.length >= 6}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    objectives: [...d.objectives, ""],
                  }))
                }
                className="text-sm text-teal-800 disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {draft.objectives.map((objective, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={objective}
                  onChange={(e) =>
                    setDraft((d) => {
                      const objectives = [...d.objectives];
                      objectives[index] = e.target.value;
                      return { ...d, objectives };
                    })
                  }
                  className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm"
                  placeholder={`Objective ${index + 1}`}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  disabled={isPending || draft.objectives.length <= 3}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      objectives: d.objectives.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-sm text-stone-500 disabled:opacity-40"
                >
                  Remove
                </button>
                <button
                  type="button"
                  disabled={isPending || index === 0}
                  onClick={() =>
                    setDraft((d) => {
                      const objectives = [...d.objectives];
                      const prev = objectives[index - 1]!;
                      objectives[index - 1] = objectives[index]!;
                      objectives[index] = prev;
                      return { ...d, objectives };
                    })
                  }
                  className="text-sm text-stone-500 disabled:opacity-40"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={isPending || index === draft.objectives.length - 1}
                  onClick={() =>
                    setDraft((d) => {
                      const objectives = [...d.objectives];
                      const next = objectives[index + 1]!;
                      objectives[index + 1] = objectives[index]!;
                      objectives[index] = next;
                      return { ...d, objectives };
                    })
                  }
                  className="text-sm text-stone-500 disabled:opacity-40"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
            >
              Save edits
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const res = await fetch(
                    `/api/lessons/${lessonId}/plan/regenerate`,
                    { method: "POST" },
                  );
                  const json = (await res.json()) as PlanPayload;
                  if (!res.ok) {
                    throw new Error(json.error ?? "Regenerate failed");
                  }
                  applyPayload(json);
                  setInfo("New plan generated from the PDF. Still pending approval.");
                })
              }
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
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
              className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-700"
            >
              Approve plan
            </button>
          </div>
        </form>
      ) : null}

      {showApprovedPlan && payload?.plan ? (
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
          {showQuizPanel ? (
            <QuizGeneratePanel
              lessonId={lessonId}
              status={payload.status}
              questionCount={payload.questionCount ?? 0}
              onQuizGenerated={loadLesson}
            />
          ) : null}
          {showQuizPlayer ? (
            <QuizPlayer lessonId={lessonId} onStatusChange={loadLesson} />
          ) : null}
        </div>
      ) : null}

      {!payload && !error ? (
        <p className="text-sm text-stone-500">Loading lesson…</p>
      ) : null}
    </section>
  );
}
