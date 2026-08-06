/**
 * Server-only env helpers. Never expose secrets via NEXT_PUBLIC_*.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid positive integer env value: ${raw}`);
  }
  return n;
}

/** Default 10 MiB */
export const DEFAULT_MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Default 50 pages */
export const DEFAULT_MAX_PDF_PAGES = 50;

/** Reject scanned/empty extracts below this many non-whitespace characters. */
export const MIN_EXTRACTED_TEXT_CHARS = 40;

/**
 * Max characters of extracted PDF text sent to DeepSeek for plan generation.
 * Longer text is truncated (beginning kept). Documented for Step 3 grounding.
 */
export const DEFAULT_MAX_PLAN_SOURCE_CHARS = 60_000;

/**
 * Max characters of extracted PDF text sent to DeepSeek for MCQ generation.
 * Defaults to the same budget as plan generation; override with MAX_QUIZ_SOURCE_CHARS.
 * No embeddings / vector DB — truncate only.
 */
export const DEFAULT_MAX_QUIZ_SOURCE_CHARS = 60_000;

export function getMaxPdfBytes(): number {
  return parsePositiveInt(process.env.MAX_PDF_BYTES, DEFAULT_MAX_PDF_BYTES);
}

export function getMaxPdfPages(): number {
  return parsePositiveInt(process.env.MAX_PDF_PAGES, DEFAULT_MAX_PDF_PAGES);
}

export function getMaxPlanSourceChars(): number {
  return parsePositiveInt(
    process.env.MAX_PLAN_SOURCE_CHARS,
    DEFAULT_MAX_PLAN_SOURCE_CHARS,
  );
}

export function getMaxQuizSourceChars(): number {
  return parsePositiveInt(
    process.env.MAX_QUIZ_SOURCE_CHARS ?? process.env.MAX_PLAN_SOURCE_CHARS,
    DEFAULT_MAX_QUIZ_SOURCE_CHARS,
  );
}

export function getDeepSeekApiKey(): string {
  return requireEnv("DEEPSEEK_API_KEY");
}

export function getDeepSeekBaseUrl(): string {
  return process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
}

export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
}
