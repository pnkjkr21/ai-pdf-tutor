import { NextResponse } from "next/server";

import {
  hintRequestSchema,
  hintResponseSchema,
} from "@/agents/schemas/hint";
import { requestQuizHint } from "@/domain/quiz-attempt";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — first/extra hint for current incorrect question (DeepSeek). */
export async function POST(request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const { previousHints } = hintRequestSchema.parse(body);
    const payload = hintResponseSchema.parse(
      await requestQuizHint(lessonId, previousHints),
    );
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
