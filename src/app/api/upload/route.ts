import { NextResponse } from "next/server";

import { uploadAndParsePdf } from "@/domain/upload-lesson";
import {
  uploadErrorSchema,
  uploadSuccessSchema,
} from "@/lib/pdf/upload-schemas";

export const runtime = "nodejs";

/**
 * POST multipart/form-data with field `file` (PDF).
 * Validates before creating a lesson; parse failures mark Lesson FAILED.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const body = uploadErrorSchema.parse({
      ok: false,
      error: "Expected multipart form data.",
      code: "INVALID_FORM",
    });
    return NextResponse.json(body, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    const body = uploadErrorSchema.parse({
      ok: false,
      error: "Missing file field. Upload a PDF as form field \"file\".",
      code: "MISSING_FILE",
    });
    return NextResponse.json(body, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadAndParsePdf({
    originalName: file.name || "upload.pdf",
    mimeType: file.type || "",
    bytes,
  });

  if (result.kind === "validated_failed") {
    const body = uploadErrorSchema.parse({
      ok: false,
      error: result.error.message,
      code: result.error.code,
    });
    return NextResponse.json(body, { status: result.error.status });
  }

  const body = uploadSuccessSchema.parse(result.payload);

  if (body.status === "FAILED") {
    // Lesson row exists (FAILED); client can show the message without hanging.
    return NextResponse.json(body, { status: 422 });
  }

  return NextResponse.json(body, { status: 201 });
}
