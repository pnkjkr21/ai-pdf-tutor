import { createHash } from "node:crypto";

import type { LessonStatus } from "@prisma/client";

import { lessonRepository } from "@/db/repositories/lesson-repository";
import { toLibraryItem, type LessonLibraryItem } from "@/domain/lesson-library";
import type { PdfStorage } from "@/lib/pdf";
import { localPdfStorage } from "@/lib/pdf";
import { parsePdfBuffer } from "@/lib/pdf/parse";
import {
  buildTextPreview,
  lessonStatusSchema,
  type UploadSuccessPayload,
} from "@/lib/pdf/upload-schemas";
import {
  assertLooksLikePdf,
  assertParsedContentAllowed,
  PdfParseBusinessError,
  PdfUploadValidationError,
} from "@/lib/pdf/validate";

/**
 * A prior lesson only blocks a re-upload if it produced something usable.
 * UPLOADED = crashed mid-flight, or the in-flight sibling of a double-submit
 *            (the row is UPLOADED for the whole parse window).
 * FAILED   = the old attempt is the very problem the re-upload is meant to fix.
 */
const NON_BLOCKING_STATUSES = ["UPLOADED", "FAILED"] as const;

/** Defined by exclusion so a future lifecycle status blocks by default. */
export const DUPLICATE_BLOCKING_STATUSES: readonly LessonStatus[] =
  lessonStatusSchema.options.filter(
    (status) =>
      !(NON_BLOCKING_STATUSES as readonly string[]).includes(status),
  );

export type UploadPdfInput = {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  /** User explicitly chose "upload a fresh copy anyway" after a 409. */
  allowDuplicate?: boolean;
};

export type UploadPdfResult =
  | { kind: "validated_failed"; error: PdfUploadValidationError }
  | { kind: "duplicate"; duplicate: LessonLibraryItem }
  | { kind: "completed"; payload: UploadSuccessPayload };

/**
 * Domain orchestration: validate → dedupe → create lesson → store → parse → persist.
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

  // Hashed here — after validation (so a bad PDF still gets its specific 400,
  // and we don't digest a blob about to be rejected for size) and before
  // createUploaded, the only point where nothing has been written yet.
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  if (!input.allowDuplicate) {
    const existing = await lessonRepository.findDuplicateByPdfHash(
      sha256,
      DUPLICATE_BLOCKING_STATUSES,
    );
    if (existing) {
      return { kind: "duplicate", duplicate: toLibraryItem(existing) };
    }
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
      // Recorded even on the override path, so a third upload sees both copies.
      sha256,
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
