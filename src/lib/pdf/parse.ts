import { extractText, getDocumentProxy } from "unpdf";

export type ParsedPdf = {
  text: string;
  pageCount: number;
};

/**
 * Extract plain text (+ page count) from PDF bytes using unpdf / PDF.js.
 */
export async function parsePdfBuffer(bytes: Buffer): Promise<ParsedPdf> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text)
      ? text.join("\n")
      : String(text ?? "");

    return {
      text: merged.replace(/\u0000/g, "").trim(),
      pageCount: totalPages,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown PDF parse error";
    throw new Error(`Unable to parse PDF: ${message}`);
  }
}
