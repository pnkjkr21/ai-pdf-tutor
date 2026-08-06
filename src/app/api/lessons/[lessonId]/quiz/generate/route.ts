import { NextResponse } from "next/server";

import { quizGenerateResponseSchema } from "@/agents/schemas/mcq";
import { generateQuizForLesson, toQuizClientSummary } from "@/domain/quiz-generate";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/**
 * POST — generate MCQs for a PLAN_APPROVED lesson (DeepSeek, PDF text only).
 * Idempotent one-shot: rejects if questions already exist.
 * Response never includes correctIndex or explanation.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const lesson = await generateQuizForLesson(lessonId);
    const quiz = toQuizClientSummary(lesson);

    const body = quizGenerateResponseSchema.parse({
      ok: true,
      lessonId: lesson.id,
      status: lesson.status,
      questionCount: quiz.questionCount,
      objectivesCovered: quiz.objectivesCovered,
      objectiveCount: quiz.objectiveCount,
      questions: quiz.questions,
      message: `Quiz ready: ${quiz.questionCount} questions covering ${quiz.objectivesCovered}/${quiz.objectiveCount} objectives. Quiz UI comes in Step 5.`,
    });

    // Belt-and-suspenders: ensure secrets never leak even if schema drifts.
    for (const q of body.questions) {
      if ("correctIndex" in q || "explanation" in q) {
        throw new Error("Refusing to return answer keys to the client");
      }
    }

    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
