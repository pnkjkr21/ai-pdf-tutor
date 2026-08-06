import { NextResponse } from "next/server";

import { learnMoreResponseSchema } from "@/agents/schemas/learn-more";
import { requestQuizLearnMore } from "@/domain/quiz-attempt";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/**
 * POST — PDF-grounded mini-lesson for the current incorrect question.
 * Does not reveal the answer or advance the quiz.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const payload = learnMoreResponseSchema.parse(
      await requestQuizLearnMore(lessonId),
    );
    const blob = JSON.stringify(payload);
    if (blob.includes('"correctIndex"')) {
      throw new Error("Refusing to return correctIndex to the client");
    }
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
