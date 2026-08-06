"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCopilotAdditionalInstructions,
  useCopilotReadable,
  useHumanInTheLoop,
} from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { PdfUploader } from "@/components/PdfUploader";
import { LessonPlanCard } from "@/components/LessonPlanCard";
import { MCQWidget } from "@/components/MCQWidget";
import { SummaryCard } from "@/components/SummaryCard";
import type { LessonPlan, LessonSummary, PublicMCQ } from "@/lib/types";

const STORAGE_KEY = "ai-pdf-tutor:active-lesson";

type Phase = "upload" | "planning" | "plan" | "quiz" | "summary";

interface InterruptState {
  type?: string;
  plan?: LessonPlan;
  question?: PublicMCQ;
  progress?: {
    objectiveIndex: number;
    objectiveTotal: number;
    questionIndex: number;
    questionTotal: number;
    objectiveTitle: string;
  };
  correct?: boolean;
  hint?: string;
  explanation?: string | null;
  selectedChoiceId?: string;
  summary?: LessonSummary;
}

interface StoredLesson {
  threadId: string;
  sessionId: string;
  fileName: string;
  preview: string;
}

export function LessonWorkspace() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [interrupt, setInterrupt] = useState<InterruptState | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<
    Array<{ questionId: string; correct: boolean; attempts: number }>
  >([]);

  const tutorContext = useMemo(() => {
    if (!interrupt?.question) return "No active quiz question.";
    return JSON.stringify(
      {
        objective: interrupt.progress?.objectiveTitle,
        question: interrupt.question.question,
        choices: interrupt.question.choices,
        lastFeedback:
          interrupt.correct === false
            ? "incorrect"
            : interrupt.correct === true
              ? "correct"
              : "pending",
      },
      null,
      2
    );
  }, [interrupt]);

  useCopilotReadable({
    description: "Current PDF lesson tutoring context (never includes answers)",
    value: {
      phase,
      fileName,
      statusMessage,
      activeQuestion: tutorContext,
      progress: interrupt?.progress ?? null,
    },
  });

  useCopilotAdditionalInstructions({
    instructions: `You are a supportive PDF learning tutor embedded beside an interactive lesson.
Rules:
- Help the learner understand concepts from the uploaded PDF.
- You may give hints and explanations of topics.
- NEVER reveal or imply which MCQ choice is correct.
- NEVER list the answer letter.
- Always encourage the learner to submit/retry in the quiz widget and finish the lesson.
- If they ask for the answer, refuse politely and offer a conceptual hint instead.`,
  });

  useHumanInTheLoop({
    name: "confirm_lesson_plan",
    description:
      "Present a lesson plan for human approval before starting the quiz.",
    parameters: [
      {
        name: "title",
        type: "string",
        description: "Lesson title",
        required: true,
      },
      {
        name: "summary",
        type: "string",
        description: "Short lesson summary",
        required: true,
      },
      {
        name: "difficulty",
        type: "string",
        description: "beginner | intermediate | advanced",
        required: true,
      },
      {
        name: "objectivesJson",
        type: "string",
        description:
          "JSON array of objectives {id,title,description,difficulty}",
        required: true,
      },
    ],
    render: ({ args, respond, status }) => {
      if (!args?.title) return <></>;
      let objectives = [] as LessonPlan["objectives"];
      try {
        objectives = JSON.parse(String(args.objectivesJson || "[]"));
      } catch {
        objectives = [];
      }
      const plan: LessonPlan = {
        title: String(args.title),
        summary: String(args.summary || ""),
        difficulty: (args.difficulty as LessonPlan["difficulty"]) || "beginner",
        objectives,
      };
      return (
        <div className="my-2 max-w-xl">
          <LessonPlanCard
            plan={plan}
            busy={status === "executing"}
            onApprove={() =>
              respond?.({ approved: true, message: "User approved the plan." })
            }
          />
        </div>
      );
    },
  });

  const persistActive = useCallback((data: StoredLesson) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota / private mode
    }
  }, []);

  const clearPersisted = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const applyResponse = useCallback(
    (data: Record<string, unknown>, extras?: Partial<StoredLesson>) => {
      const nextThreadId = String(data.threadId);
      setThreadId(nextThreadId);
      setStatusMessage(String(data.statusMessage || ""));
      setAttempts((data.attempts as typeof attempts) || []);
      const nextInterrupt = (data.interrupt as InterruptState) || null;
      setInterrupt(nextInterrupt);

      const nextSessionId =
        extras?.sessionId ||
        (typeof data.lessonId === "string" ? data.lessonId : sessionId) ||
        "";
      const nextFileName =
        extras?.fileName ||
        (typeof data.fileName === "string" ? data.fileName : fileName) ||
        "";
      const nextPreview = extras?.preview ?? preview;

      if (nextSessionId && nextThreadId) {
        persistActive({
          threadId: nextThreadId,
          sessionId: nextSessionId,
          fileName: nextFileName,
          preview: nextPreview,
        });
      }

      if (!nextInterrupt) {
        if (data.summary) {
          setPhase("summary");
          setInterrupt({
            type: "summary",
            summary: data.summary as LessonSummary,
          });
        }
        return;
      }

      if (nextInterrupt.type === "plan_approval") setPhase("plan");
      else if (nextInterrupt.type === "summary") setPhase("summary");
      else setPhase("quiz");
    },
    [fileName, persistActive, preview, sessionId]
  );

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          if (!cancelled) setRestoring(false);
          return;
        }
        const stored = JSON.parse(raw) as StoredLesson;
        if (!stored?.threadId) {
          if (!cancelled) setRestoring(false);
          return;
        }

        setBusy(true);
        setSessionId(stored.sessionId);
        setFileName(stored.fileName);
        setPreview(stored.preview || "");

        const res = await fetch(
          `/api/lesson?threadId=${encodeURIComponent(stored.threadId)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          clearPersisted();
          return;
        }
        applyResponse(data, stored);
      } catch {
        if (!cancelled) clearPersisted();
      } finally {
        if (!cancelled) {
          setBusy(false);
          setRestoring(false);
        }
      }
    }

    void restore();

    return () => {
      cancelled = true;
    };
    // Restore once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLesson(nextSessionId: string, meta: { fileName: string; preview: string }) {
    setBusy(true);
    setError(null);
    setPhase("planning");
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: nextSessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start lesson");
      applyResponse(data, {
        sessionId: nextSessionId,
        fileName: meta.fileName,
        preview: meta.preview,
        threadId: String(data.threadId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start lesson");
      setPhase("upload");
      clearPersisted();
    } finally {
      setBusy(false);
    }
  }

  async function resume(payload: unknown) {
    if (!threadId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lesson", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, resume: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to continue lesson");
      applyResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    clearPersisted();
    setPhase("upload");
    setSessionId(null);
    setFileName("");
    setPreview("");
    setThreadId(null);
    setInterrupt(null);
    setStatusMessage("");
    setError(null);
    setAttempts([]);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#fafaf9_45%,_#f5f5f4_100%)] text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              AI PDF Tutor
            </p>
            <h1 className="text-lg font-semibold">
              Interactive lessons from your documents
            </h1>
          </div>
          <p className="hidden text-xs text-stone-500 sm:block">
            LangGraph HITL · CopilotKit tutor · Generative MCQ UI
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">1. Setup</h2>
            <p className="mt-1 text-xs text-stone-500">
              Upload a PDF. Progress is saved to SQLite — refresh keeps your
              place.
            </p>
            <div className="mt-3">
              <PdfUploader
                disabled={busy || restoring || phase === "planning"}
                onUploaded={(result) => {
                  setSessionId(result.sessionId);
                  setFileName(result.fileName);
                  setPreview(result.preview);
                  void startLesson(result.sessionId, {
                    fileName: result.fileName,
                    preview: result.preview,
                  });
                }}
              />
            </div>
            {fileName && (
              <p className="mt-3 text-xs text-stone-600">
                Loaded: <span className="font-medium">{fileName}</span>
              </p>
            )}
            {(phase !== "upload" || threadId) && (
              <button
                type="button"
                onClick={reset}
                className="mt-3 text-xs font-medium text-stone-600 underline"
              >
                Start over
              </button>
            )}
            <a
              href="/samples/photosynthesis.pdf"
              className="mt-3 ml-3 inline-block text-xs font-medium text-teal-700 underline"
              download
            >
              Download sample PDF
            </a>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Progress</h2>
            <ul className="mt-3 space-y-2 text-xs text-stone-600">
              <Step done={!!sessionId} label="PDF parsed" />
              <Step
                done={phase !== "upload" && phase !== "planning"}
                label="Plan drafted"
                active={phase === "planning" || restoring}
              />
              <Step
                done={["quiz", "summary"].includes(phase)}
                label="HITL approved"
              />
              <Step
                done={phase === "summary"}
                label="Quiz loop"
                active={phase === "quiz"}
              />
              <Step done={phase === "summary"} label="Summary" />
            </ul>
            {attempts.length > 0 && (
              <p className="mt-3 text-xs text-stone-500">
                Recorded answers: {attempts.filter((a) => a.correct).length}/
                {attempts.length}
              </p>
            )}
          </div>

          {preview && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">PDF preview</h2>
              <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-stone-500">
                {preview}…
              </p>
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {(phase === "upload" || restoring) && !interrupt && (
            <EmptyState
              title={
                restoring ? "Restoring your lesson…" : "Upload a PDF to begin"
              }
            >
              {restoring
                ? "Loading your saved progress from SQLite."
                : "The agent will propose learning objectives and difficulty, then pause for your approval before generating MCQs."}
            </EmptyState>
          )}

          {phase === "planning" && (
            <EmptyState title="Analyzing your PDF…">
              Drafting a structured lesson plan with objectives and difficulty.
            </EmptyState>
          )}

          {phase === "plan" && interrupt?.plan && (
            <LessonPlanCard
              plan={interrupt.plan}
              statusMessage={statusMessage}
              busy={busy}
              onApprove={(plan) => resume({ approved: true, plan })}
            />
          )}

          {phase === "quiz" && interrupt?.question && interrupt.progress && (
            <MCQWidget
              question={interrupt.question}
              progress={interrupt.progress}
              feedback={
                interrupt.type === "mcq_feedback"
                  ? {
                      correct: interrupt.correct,
                      hint: interrupt.hint,
                      explanation: interrupt.explanation,
                      selectedChoiceId: interrupt.selectedChoiceId,
                    }
                  : undefined
              }
              busy={busy}
              onSubmit={(selectedChoiceId) => resume({ selectedChoiceId })}
              onContinue={() => resume({ acknowledged: true })}
            />
          )}

          {phase === "summary" && interrupt?.summary && (
            <SummaryCard summary={interrupt.summary} onRestart={reset} />
          )}
        </section>
      </main>

      <CopilotSidebar
        defaultOpen={false}
        labels={{
          title: "Tutor chat",
          initial:
            "Ask for hints or to learn more about the current topic. I will not reveal quiz answers — keep using the lesson widget to finish.",
        }}
        clickOutsideToClose
      />
    </div>
  );
}

function Step({
  label,
  done,
  active,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${
          done ? "bg-teal-600" : active ? "bg-amber-500" : "bg-stone-300"
        }`}
      />
      <span className={done ? "text-stone-800" : ""}>{label}</span>
    </li>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">{children}</p>
    </div>
  );
}
