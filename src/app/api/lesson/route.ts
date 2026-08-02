import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { isGraphInterrupt } from "@langchain/langgraph";
import { Command, getInterruptValue, lessonGraph } from "@/agent/graph";
import { getSession } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

function configFor(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

async function runAndRespond(invokeInput: unknown, threadId: string) {
  let interrupt: unknown | null = null;

  try {
    const result = await lessonGraph.invoke(
      invokeInput as never,
      configFor(threadId)
    );
    interrupt = getInterruptValue(result);
  } catch (error) {
    if (isGraphInterrupt(error)) {
      interrupt = error.interrupts?.[0]?.value ?? null;
    } else {
      throw error;
    }
  }

  const state = await lessonGraph.getState(configFor(threadId));
  const values = (state.values || {}) as Record<string, unknown>;

  return NextResponse.json({
    threadId,
    interrupt,
    done: !interrupt,
    statusMessage: values.statusMessage ?? "",
    plan: values.plan ?? null,
    summary: values.summary ?? null,
    attempts: values.attempts ?? [],
    objectiveIndex: values.objectiveIndex ?? 0,
    questionIndex: values.questionIndex ?? 0,
  });
}

/** Start lesson: plan → HITL interrupt */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found. Upload the PDF again." },
        { status: 404 }
      );
    }

    const threadId = uuidv4();

    return await runAndRespond(
      {
        sessionId: session.id,
        fileName: session.fileName,
        pdfText: session.pdfText,
      },
      threadId
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

    return await runAndRespond(new Command({ resume }), threadId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resume lesson";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
