import { NextResponse } from "next/server";

import { getCurrentQuiz } from "@/domain/quiz-attempt";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** GET — current safe question + progress (no answer keys unless already correct). */
export async function GET(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const payload = await getCurrentQuiz(lessonId);
    assertNoLeak(payload);
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}

function assertNoLeak(payload: {
  phase: string;
  explanation: string | null;
  question: unknown;
}) {
  const blob = JSON.stringify(payload);
  if (blob.includes('"correctIndex"')) {
    throw new Error("Refusing to return correctIndex to the client");
  }
  if (payload.phase !== "correct" && payload.phase !== "finished" && payload.explanation) {
    throw new Error("Refusing to return explanation before a correct answer");
  }
}
