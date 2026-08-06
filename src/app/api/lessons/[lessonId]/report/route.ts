import { NextResponse } from "next/server";

import { completionReportResponseSchema } from "@/agents/schemas/study-tips";
import { generateCompletionReport } from "@/domain/completion-report";
import { domainErrorResponse } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ lessonId: string }> };

export const runtime = "nodejs";

function assertNoAnswerKeyLeak(payload: unknown) {
  const blob = JSON.stringify(payload);
  if (blob.includes('"correctIndex"') || blob.includes('"correctChoice"')) {
    throw new Error("Refusing to return answer-key fields in completion report");
  }
}

/** GET — return persisted report, or generate once if missing (idempotent). */
export async function GET(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const { report, regenerated } = await generateCompletionReport(lessonId, {
      forceRegenerate: false,
    });
    const payload = completionReportResponseSchema.parse({
      ok: true,
      lessonId,
      status: "COMPLETED",
      report,
      regenerated,
    });
    assertNoAnswerKeyLeak(payload);
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/** POST — recompute metrics + regenerate study tips (COMPLETED only). */
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;
  try {
    const { report, regenerated } = await generateCompletionReport(lessonId, {
      forceRegenerate: true,
    });
    const payload = completionReportResponseSchema.parse({
      ok: true,
      lessonId,
      status: "COMPLETED",
      report,
      regenerated,
    });
    assertNoAnswerKeyLeak(payload);
    return NextResponse.json(payload);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
