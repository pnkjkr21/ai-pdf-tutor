import { NextResponse } from "next/server";

import {
  toPlanClientPayload,
  updatePendingPlan,
} from "@/domain/lesson-plan";
import { domainErrorResponse } from "@/lib/api-errors";
import { apiErrorSchema } from "@/agents/schemas/lesson-plan";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

/** PATCH — save user edits while pending approval. */
export async function PATCH(request: Request, context: RouteContext) {
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
    const lesson = await updatePendingPlan(lessonId, body);
    return NextResponse.json(toPlanClientPayload(lesson));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
