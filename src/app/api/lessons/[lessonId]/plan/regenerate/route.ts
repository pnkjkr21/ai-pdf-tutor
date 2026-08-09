import { NextResponse } from "next/server";

import { planRegenerateRequestSchema } from "@/agents/schemas/lesson-plan";
import {
  regeneratePlanForLesson,
  toPlanClientPayload,
} from "@/domain/lesson-plan";
import { PlanDomainError } from "@/domain/errors";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** POST — revise pending plan from PDF + previous plan + learner goal. No MCQs. */
export async function POST(request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = planRegenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new PlanDomainError(
        "INVALID_BODY",
        "Choose what you want to change before regenerating.",
        400,
      );
    }
    const lesson = await regeneratePlanForLesson(lessonId, parsed.data.goal);
    return NextResponse.json(toPlanClientPayload(lesson));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
