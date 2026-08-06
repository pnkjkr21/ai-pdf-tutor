import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { isGraphInterrupt } from "@langchain/langgraph";
import {
  Command,
  getInterruptFromState,
  getInterruptValue,
  lessonGraph,
} from "@/agent/graph";
import {
  attachThread,
  getLessonById,
  getLessonByThreadId,
  syncLessonFromGraphState,
} from "@/lib/lesson-repository";
import { getSession } from "@/lib/store";
import type {
  LessonPlan,
  LessonSummary,
  MCQQuestion,
  QuizAttempt,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function configFor(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

async function buildLessonResponse(threadId: string, lessonId: string) {
  const state = await lessonGraph.getState(configFor(threadId));
  const values = (state.values || {}) as {
    plan?: LessonPlan | null;
    planApproved?: boolean;
    objectiveIndex?: number;
    questionIndex?: number;
    currentQuestions?: MCQQuestion[];
    attempts?: QuizAttempt[];
    summary?: LessonSummary | null;
    statusMessage?: string;
    fileName?: string;
  };

  const interrupt =
    getInterruptFromState(state) ??
    (values.summary
      ? { type: "summary", summary: values.summary }
      : null);

  const interruptType =
    interrupt && typeof interrupt === "object" && "type" in interrupt
      ? String((interrupt as { type: string }).type)
      : null;

  syncLessonFromGraphState({
    lessonId,
    threadId,
    fileName: values.fileName,
    plan: values.plan ?? null,
    planApproved: Boolean(values.planApproved),
    objectiveIndex: values.objectiveIndex ?? 0,
    questionIndex: values.questionIndex ?? 0,
    currentQuestions: values.currentQuestions ?? [],
    attempts: values.attempts ?? [],
    summary: values.summary ?? null,
    statusMessage: values.statusMessage ?? "",
    interruptType,
  });

  return {
    threadId,
    lessonId,
    interrupt,
    done: !interrupt,
    statusMessage: values.statusMessage ?? "",
    plan: values.plan ?? null,
    summary: values.summary ?? null,
    attempts: values.attempts ?? [],
    objectiveIndex: values.objectiveIndex ?? 0,
    questionIndex: values.questionIndex ?? 0,
    fileName: values.fileName ?? "",
  };
}

async function runAndRespond(
  invokeInput: unknown,
  threadId: string,
  lessonId: string
) {
  try {
    const result = await lessonGraph.invoke(
      invokeInput as never,
      configFor(threadId)
    );
    // Prefer interrupt from invoke result when present
    const fromInvoke = getInterruptValue(result);
    const payload = await buildLessonResponse(threadId, lessonId);
    if (fromInvoke && !payload.interrupt) {
      payload.interrupt = fromInvoke;
      payload.done = false;
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (isGraphInterrupt(error)) {
      const payload = await buildLessonResponse(threadId, lessonId);
      if (!payload.interrupt) {
        payload.interrupt = error.interrupts?.[0]?.value ?? null;
        payload.done = !payload.interrupt;
      }
      return NextResponse.json(payload);
    }
    throw error;
  }
}

/** Restore an in-progress lesson after refresh. */
export async function GET(req: NextRequest) {
  try {
    const threadId = req.nextUrl.searchParams.get("threadId");
    if (!threadId) {
      return NextResponse.json({ error: "threadId required" }, { status: 400 });
    }

    const lesson = await getLessonByThreadId(threadId);

    const state = await lessonGraph.getState(configFor(threadId));
    if (!state.values || Object.keys(state.values).length === 0) {
      return NextResponse.json(
        { error: "No saved lesson found for this thread." },
        { status: 404 }
      );
    }

    const lessonId =
      lesson?.id ||
      String((state.values as { sessionId?: string }).sessionId || "");
    if (!lessonId) {
      return NextResponse.json(
        { error: "Lesson id missing for thread." },
        { status: 404 }
      );
    }

    return NextResponse.json(await buildLessonResponse(threadId, lessonId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to restore lesson";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Start lesson: plan → HITL interrupt */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const memorySession = getSession(sessionId);
    const dbLesson = await getLessonById(sessionId);
    const fileName = memorySession?.fileName || dbLesson?.fileName;
    const pdfText = memorySession?.pdfText || dbLesson?.pdfText;

    if (!fileName || !pdfText) {
      return NextResponse.json(
        { error: "Session not found. Upload the PDF again." },
        { status: 404 }
      );
    }

    const threadId = uuidv4();
    attachThread(sessionId, threadId);

    return await runAndRespond(
      {
        sessionId,
        fileName,
        pdfText,
      },
      threadId,
      sessionId
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start lesson";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Resume after HITL (plan approval or MCQ answer) */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { threadId, resume } = body as {
      threadId?: string;
      resume?: unknown;
    };

    if (!threadId || resume === undefined) {
      return NextResponse.json(
        { error: "threadId and resume payload required" },
        { status: 400 }
      );
    }

    const lesson = await getLessonByThreadId(threadId);
    const state = await lessonGraph.getState(configFor(threadId));
    const lessonId =
      lesson?.id ||
      String(
        (state.values as { sessionId?: string } | undefined)?.sessionId || ""
      );

    if (!lessonId) {
      return NextResponse.json(
        { error: "Lesson not found for thread. Start a new lesson." },
        { status: 404 }
      );
    }

    return await runAndRespond(new Command({ resume }), threadId, lessonId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resume lesson";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
