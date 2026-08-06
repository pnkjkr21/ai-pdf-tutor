import { NextResponse } from "next/server";

import { advanceQuiz } from "@/domain/quiz-attempt";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — advance cursor after a correct answer (or finish lesson). */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const payload = await advanceQuiz(lessonId);
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
