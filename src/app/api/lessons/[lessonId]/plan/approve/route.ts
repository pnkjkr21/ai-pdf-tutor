import { NextResponse } from "next/server";

import {
  approvePlanForLesson,
  toPlanClientPayload,
} from "@/domain/lesson-plan";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/**
 * POST — approve pending plan.
 * Hard gate: does not generate MCQs / Question rows (Step 4).
 */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const lesson = await approvePlanForLesson(lessonId);
    return NextResponse.json({
      ...toPlanClientPayload(lesson),
      message: "Plan approved — quiz generation comes next.",
    });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
