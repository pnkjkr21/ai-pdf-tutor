import { NextResponse } from "next/server";

import { LESSON_LIBRARY_LIMIT, listLessonLibrary } from "@/domain/lesson-library";
import { domainErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — lesson library for the side panel (most recently updated first). */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("limit");
    const parsed = raw === null ? LESSON_LIBRARY_LIMIT : Number(raw);
    const limit =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.floor(parsed), LESSON_LIBRARY_LIMIT)
        : LESSON_LIBRARY_LIMIT;

    return NextResponse.json(await listLessonLibrary(limit));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
