import { NextResponse } from "next/server";

import {
  generatePlanForLesson,
  toPlanClientPayload,
} from "@/domain/lesson-plan";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — generate pending plan from PARSED lesson (DeepSeek). No MCQs. */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const lesson = await generatePlanForLesson(lessonId);
    return NextResponse.json(toPlanClientPayload(lesson), { status: 201 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
