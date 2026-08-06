import {
  getMaxPdfBytes,
  getMaxPdfPages,
  MIN_EXTRACTED_TEXT_CHARS,
} from "@/lib/env";

export class PdfUploadValidationError extends Error {
  readonly code:
    | "MISSING_FILE"
    | "INVALID_EXTENSION"
    | "INVALID_MIME"
    | "INVALID_MAGIC"
    | "EMPTY_FILE"
    | "TOO_LARGE";

  readonly status = 400 as const;

  constructor(
    code: PdfUploadValidationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "PdfUploadValidationError";
    this.code = code;
  }
}

export class PdfParseBusinessError extends Error {
  readonly code: "TOO_MANY_PAGES" | "EMPTY_TEXT" | "UNREADABLE";

  constructor(code: PdfParseBusinessError["code"], message: string) {
    super(message);
    this.name = "PdfParseBusinessError";
    this.code = code;
  }
}

const PDF_MAGIC = Buffer.from("%PDF");

export function assertLooksLikePdf(params: {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}): void {
  const { originalName, mimeType, bytes } = params;

  if (!bytes.length) {
    throw new PdfUploadValidationError("EMPTY_FILE", "Uploaded file is empty.");
  }

  const lower = originalName.toLowerCase();
  if (!lower.endsWith(".pdf")) {
    throw new PdfUploadValidationError(
      "INVALID_EXTENSION",
      "Only .pdf files are accepted.",
    );
  }

  // Client MIME is untrusted; allow missing/octet-stream but reject clear mismatches.
  const normalizedMime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (
    normalizedMime &&
    normalizedMime !== "application/pdf" &&
    normalizedMime !== "application/octet-stream"
  ) {
    throw new PdfUploadValidationError(
      "INVALID_MIME",
      "File MIME type must be application/pdf.",
    );
  }

  if (bytes.length < 5 || !bytes.subarray(0, 4).equals(PDF_MAGIC)) {
    throw new PdfUploadValidationError(
      "INVALID_MAGIC",
      "File content is not a valid PDF (missing %PDF header).",
    );
  }

  const maxBytes = getMaxPdfBytes();
  if (bytes.byteLength > maxBytes) {
    throw new PdfUploadValidationError(
      "TOO_LARGE",
      `PDF exceeds the maximum size of ${maxBytes} bytes.`,
    );
  }
}

export function assertParsedContentAllowed(params: {
  pageCount: number;
  text: string;
}): void {
  const maxPages = getMaxPdfPages();
  if (params.pageCount > maxPages) {
    throw new PdfParseBusinessError(
      "TOO_MANY_PAGES",
      `PDF has ${params.pageCount} pages; maximum allowed is ${maxPages}.`,
    );
  }

  const significant = params.text.replace(/\s+/g, " ").trim();
  if (significant.length < MIN_EXTRACTED_TEXT_CHARS) {
    throw new PdfParseBusinessError(
      "EMPTY_TEXT",
      "Could not extract enough text from this PDF. Scanned or image-only PDFs are not supported — please upload a text-based PDF.",
    );
  }
}
