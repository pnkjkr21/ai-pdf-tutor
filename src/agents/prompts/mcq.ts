import { getMaxQuizSourceChars } from "@/lib/env";

export function truncatePdfTextForQuiz(extractedText: string): {
  text: string;
  truncated: boolean;
  maxChars: number;
} {
  const maxChars = getMaxQuizSourceChars();
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

export function buildMcqSystemPrompt(): string {
  return [
    "You are an assessment designer writing multiple-choice questions from a single PDF.",
    "Use ONLY the provided PDF text. Do not invent facts outside that text.",
    "Every question must be answerable from the PDF text alone.",
    "Write exactly 4 answer choices per question. Exactly one choice is correct.",
    "Explanations should teach the concept without merely restating “because it is correct.”",
    "Map each question to an objective via objectiveOrderIndex (0-based, matching the list provided).",
    "Create 1 or 2 questions per learning objective. Total questions must be between the objective count and 12.",
    "Respond with a single JSON object only (no markdown fences):",
    '{ "questions": [ { "objectiveOrderIndex": number, "prompt": string, "choices": [string,string,string,string], "correctIndex": 0|1|2|3, "explanation": string } ] }',
  ].join(" ");
}

export function buildMcqUserPrompt(params: {
  title: string;
  difficulty: string;
  objectives: Array<{ orderIndex: number; statement: string }>;
  pdfText: string;
  truncated: boolean;
  maxChars: number;
}): string {
  const note = params.truncated
    ? `\n\n[Note: PDF text was truncated to the first ${params.maxChars} characters for model context. No embeddings or vector search are used.]`
    : "\n\n[Note: Grounding uses truncated PDF text only — no embeddings or vector DB.]";

  const objectivesBlock = params.objectives
    .map((o) => `${o.orderIndex}. ${o.statement}`)
    .join("\n");

  return [
    `Lesson title: ${params.title}`,
    `Difficulty: ${params.difficulty}`,
    "",
    "Learning objectives (use these objectiveOrderIndex values):",
    objectivesBlock,
    note,
    "",
    "--- PDF TEXT START ---",
    params.pdfText,
    "--- PDF TEXT END ---",
  ].join("\n");
}
