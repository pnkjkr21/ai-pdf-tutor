import { NextResponse } from "next/server";

import {
  regeneratePlanForLesson,
  toPlanClientPayload,
} from "@/domain/lesson-plan";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — revise pending plan from PDF + previous plan (DeepSeek). No MCQs. */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const lesson = await regeneratePlanForLesson(lessonId);
    return NextResponse.json(toPlanClientPayload(lesson));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
