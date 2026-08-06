import { NextResponse } from "next/server";

import {
  getLessonForClient,
  toPlanClientPayload,
} from "@/domain/lesson-plan";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const lesson = await getLessonForClient(lessonId);
    return NextResponse.json(toPlanClientPayload(lesson));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
