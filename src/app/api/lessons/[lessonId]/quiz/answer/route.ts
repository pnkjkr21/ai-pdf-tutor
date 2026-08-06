import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { submitQuizAnswer } from "@/domain/quiz-attempt";
import { apiErrorSchema } from "@/agents/schemas/lesson-plan";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — grade answer in app code; return feedback without leaking keys on miss. */
export async function POST(request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      apiErrorSchema.parse({
        ok: false,
        error: "Expected JSON body.",
        code: "INVALID_BODY",
      }),
      { status: 400 },
    );
  }

  try {
    const payload = await submitQuizAnswer(lessonId, body);
    const blob = JSON.stringify(payload);
    if (blob.includes('"correctIndex"')) {
      throw new Error("Refusing to return correctIndex to the client");
    }
    if (payload.outcome === "INCORRECT" && payload.explanation) {
      throw new Error("Refusing to return explanation on incorrect answer");
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        apiErrorSchema.parse({
          ok: false,
          error: "Invalid answer payload. Need questionId and selectedIndex 0–3.",
          code: "INVALID_BODY",
        }),
        { status: 400 },
      );
    }
    return domainErrorResponse(error);
  }
}
