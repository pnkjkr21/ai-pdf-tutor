import { NextResponse } from "next/server";

import { deleteLesson } from "@/domain/delete-lesson";
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

/** DELETE — remove the lesson, its child rows (cascade), and its stored PDF. */
export async function DELETE(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const { lessonId: deleted } = await deleteLesson(lessonId);
    return NextResponse.json({ ok: true, lessonId: deleted });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
