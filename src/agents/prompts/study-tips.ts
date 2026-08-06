import { getMaxQuizSourceChars } from "@/lib/env";

export function truncatePdfTextForStudyTips(extractedText: string): {
  text: string;
  truncated: boolean;
  maxChars: number;
} {
  const maxChars = Math.min(getMaxQuizSourceChars(), 40_000);
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

export function buildStudyTipsSystemPrompt(): string {
  return [
    "You are a supportive study coach reviewing a completed PDF-based lesson quiz.",
    "Write personalized study tips grounded only in the PDF text and the strong/weak learning objectives provided.",
    "Hard rules:",
    "- Do NOT invent facts that are not supported by the PDF text.",
    "- Do NOT mention multiple-choice options, correct answers, or answer indices.",
    "- Do NOT spoil quiz answers; focus on concepts to review or reinforce.",
    "- Prefer concrete, actionable tips tied to weak areas; briefly reinforce strong areas.",
    "- Keep language clear and encouraging.",
    'Respond with JSON only: { "overview": string, "tips": string[] }',
    "overview: 2–4 sentences summarizing performance and what to study next.",
    "tips: 2–6 short actionable tips.",
  ].join(" ");
}

export function buildStudyTipsUserPrompt(params: {
  title: string;
  strongAreas: Array<{ orderIndex: number; statement: string }>;
  weakAreas: Array<{ orderIndex: number; statement: string }>;
  metricsSummary: string;
  pdfText: string;
  truncated: boolean;
  maxChars: number;
}): string {
  const note = params.truncated
    ? `\n[PDF text truncated to ${params.maxChars} characters.]`
    : "";

  const formatAreas = (
    label: string,
    areas: Array<{ orderIndex: number; statement: string }>,
  ) => {
    if (areas.length === 0) {
      return `${label}: (none)`;
    }
    return [
      `${label}:`,
      ...areas.map((a) => `- [${a.orderIndex + 1}] ${a.statement}`),
    ].join("\n");
  };

  return [
    `Lesson title: ${params.title}`,
    params.metricsSummary,
    "",
    formatAreas("Strong areas (high first-try success)", params.strongAreas),
    "",
    formatAreas("Weak areas (misses / retries)", params.weakAreas),
    note,
    "",
    "--- PDF TEXT ---",
    params.pdfText,
    "--- END ---",
  ].join("\n");
}
