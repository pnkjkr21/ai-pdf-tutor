import { NextResponse } from "next/server";

import { getQuizHistory, type ReviewedQuestion } from "@/domain/quiz-attempt";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** GET — questions already answered correctly, for read-only review mid-quiz. */
export async function GET(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const payload = await getQuizHistory(lessonId);
    assertOnlySolvedQuestions(payload.questions);
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/**
 * Answer keys ship here on purpose, but only for questions the learner has
 * already solved (they saw the explanation then). Fail closed otherwise.
 */
function assertOnlySolvedQuestions(questions: ReviewedQuestion[]) {
  for (const question of questions) {
    const solved = question.attempts.some((a) => a.outcome === "CORRECT");
    if (!solved) {
      throw new Error("Refusing to return answer keys for an unsolved question");
    }
  }
}
