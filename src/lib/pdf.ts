import { extractText, getDocumentProxy } from "unpdf";

const MAX_CHARS = 60_000;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const normalized = (Array.isArray(text) ? text.join("\n") : text || "")
    .replace(/\s+\n/g, "\n")
    .trim();

  if (!normalized || normalized.length < 40) {
    throw new Error(
      "Could not extract enough text from this PDF. Try a text-based PDF (not a scanned image)."
    );
  }
  return normalized.slice(0, MAX_CHARS);
}
