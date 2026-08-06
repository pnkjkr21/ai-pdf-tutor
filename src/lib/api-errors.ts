import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/agents/schemas/lesson-plan";
import { PlanDomainError } from "@/domain/errors";

function asPlanDomainError(error: unknown): PlanDomainError | null {
  if (error instanceof PlanDomainError) {
    return error;
  }
  // Duck-type across bundler copies of the class (instanceof can fail).
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "PlanDomainError" &&
    typeof (error as { status?: unknown }).status === "number" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return error as PlanDomainError;
  }
  return null;
}

export function domainErrorResponse(error: unknown) {
  const domainError = asPlanDomainError(error);
  if (domainError) {
    const body = apiErrorSchema.parse({
      ok: false,
      error: domainError.message,
      code: domainError.code,
    });
    return NextResponse.json(body, { status: domainError.status });
  }
  console.error(error);
  const body = apiErrorSchema.parse({
    ok: false,
    error: error instanceof Error ? error.message : "Unexpected server error",
    code: "INTERNAL",
  });
  return NextResponse.json(body, { status: 500 });
}
