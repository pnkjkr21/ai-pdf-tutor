import { NextResponse } from "next/server";

import { hintResponseSchema } from "@/agents/schemas/hint";
import { requestQuizHint } from "@/domain/quiz-attempt";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — first/extra hint for current incorrect question (DeepSeek). */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const payload = hintResponseSchema.parse(await requestQuizHint(lessonId));
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
