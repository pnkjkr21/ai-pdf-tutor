import { getMaxPlanSourceChars } from "@/lib/env";

export function truncatePdfTextForPlan(extractedText: string): {
  text: string;
  truncated: boolean;
  maxChars: number;
} {
  const maxChars = getMaxPlanSourceChars();
  const trimmed = extractedText.trim();
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false, maxChars };
  }
  return {
    text: trimmed.slice(0, maxChars),
    truncated: true,
    maxChars,
  };
}

export function buildLessonPlanSystemPrompt(): string {
  return [
    "You are an instructional designer creating a lesson plan from a single PDF.",
    "Use ONLY the provided PDF text. Do not invent facts, topics, or examples that are not supported by that text.",
    "Objectives must be teachable from the provided text alone.",
    "Respond with a single JSON object only (no markdown fences) matching this shape:",
    '{ "title": string, "difficulty": "BEGINNER"|"INTERMEDIATE"|"ADVANCED", "summary": string|null, "objectives": string[] }',
    "Provide 3 to 6 clear, specific learning objectives (ordered from foundational to advanced).",
    "Keep the title concise. Summary should be 1–3 sentences or null.",
  ].join(" ");
}

export function buildLessonPlanUserPrompt(params: {
  pdfText: string;
  truncated: boolean;
  maxChars: number;
}): string {
  const note = params.truncated
    ? `\n\n[Note: PDF text was truncated to the first ${params.maxChars} characters for model context.]`
    : "";

  return `Create a lesson plan grounded only in the following PDF text.${note}\n\n--- PDF TEXT START ---\n${params.pdfText}\n--- PDF TEXT END ---`;
}
