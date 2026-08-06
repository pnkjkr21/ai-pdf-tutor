import { createHash } from "node:crypto";

import { lessonRepository } from "@/db/repositories/lesson-repository";
import type { PdfStorage } from "@/lib/pdf";
import { localPdfStorage } from "@/lib/pdf";
import { parsePdfBuffer } from "@/lib/pdf/parse";
import {
  buildTextPreview,
  type UploadSuccessPayload,
} from "@/lib/pdf/upload-schemas";
import {
  assertLooksLikePdf,
  assertParsedContentAllowed,
  PdfParseBusinessError,
  PdfUploadValidationError,
} from "@/lib/pdf/validate";

export type UploadPdfInput = {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
};

export type UploadPdfResult =
  | { kind: "validated_failed"; error: PdfUploadValidationError }
  | { kind: "completed"; payload: UploadSuccessPayload };

/**
 * Domain orchestration: validate → create lesson → store → parse → persist.
 * Deterministic app logic only (no LLM).
 */
export async function uploadAndParsePdf(
  input: UploadPdfInput,
  storage: PdfStorage = localPdfStorage,
): Promise<UploadPdfResult> {
  try {
    assertLooksLikePdf(input);
  } catch (error) {
    if (error instanceof PdfUploadValidationError) {
      return { kind: "validated_failed", error };
    }
    throw error;
  }

  const lesson = await lessonRepository.createUploaded();

  try {
    const stored = await storage.save({
      lessonId: lesson.id,
      originalName: input.originalName,
      bytes: input.bytes,
    });

    await lessonRepository.createPdfAsset({
      lessonId: lesson.id,
      originalName: input.originalName,
      mimeType: "application/pdf",
      byteSize: stored.byteSize,
      storagePath: stored.storagePath,
    });

    let pageCount: number | null = null;
    let extractedText = "";

    try {
      const parsed = await parsePdfBuffer(input.bytes);
      pageCount = parsed.pageCount;
      extractedText = parsed.text;

      await lessonRepository.updatePdfAsset(lesson.id, {
        pageCount,
        extractedText: extractedText || null,
      });

      assertParsedContentAllowed({
        pageCount: parsed.pageCount,
        text: parsed.text,
      });
    } catch (error) {
      const message = toUserFacingFailureMessage(error);

      if (pageCount !== null || extractedText) {
        await lessonRepository.updatePdfAsset(lesson.id, {
          pageCount,
          extractedText: extractedText || null,
        });
      }

      const failed = await lessonRepository.markStatus(
        lesson.id,
        "FAILED",
        message,
      );

      return {
        kind: "completed",
        payload: {
          ok: true,
          lessonId: failed.id,
          status: "FAILED",
          originalName: input.originalName,
          pageCount,
          textLength: extractedText.length,
          textPreview: buildTextPreview(extractedText),
          errorMessage: message,
        },
      };
    }

    const sourceTextHash = createHash("sha256")
      .update(extractedText)
      .digest("hex");

    const updated = await lessonRepository.markStatus(
      lesson.id,
      "PARSED",
      null,
      { sourceTextHash },
    );

    return {
      kind: "completed",
      payload: {
        ok: true,
        lessonId: updated.id,
        status: updated.status,
        originalName: input.originalName,
        pageCount,
        textLength: extractedText.length,
        textPreview: buildTextPreview(extractedText),
        errorMessage: null,
      },
    };
  } catch (error) {
    const message = toUserFacingFailureMessage(error);
    const failed = await lessonRepository.markStatus(
      lesson.id,
      "FAILED",
      message,
    );

    return {
      kind: "completed",
      payload: {
        ok: true,
        lessonId: failed.id,
        status: "FAILED",
        originalName: input.originalName,
        pageCount: null,
        textLength: 0,
        textPreview: "",
        errorMessage: message,
      },
    };
  }
}

function toUserFacingFailureMessage(error: unknown): string {
  if (error instanceof PdfParseBusinessError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message.startsWith("Unable to parse PDF")
      ? error.message
      : `Failed to process PDF: ${error.message}`;
  }
  return "Failed to process PDF.";
}
