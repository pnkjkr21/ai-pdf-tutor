import { getMaxQuizSourceChars } from "@/lib/env";

export function truncatePdfTextForLearnMore(extractedText: string): {
  text: string;
  truncated: boolean;
  maxChars: number;
} {
  const maxChars = Math.min(getMaxQuizSourceChars(), 24_000);
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

export function buildLearnMoreSystemPrompt(): string {
  return [
    "You are a patient tutor writing a short mini-lesson from a single PDF.",
    "Teach the underlying concept so the student can reason about a multiple-choice question.",
    "Hard rules:",
    "- Use ONLY the provided PDF text. Do not invent outside facts.",
    "- Do NOT say which choice is correct (no A/B/C/D, no “the answer is”).",
    "- Do NOT quote or paraphrase any answer choice as the solution.",
    "- Keep the explanation helpful but incomplete enough that the MCQ remains a real test.",
    "- Be socratic/explanatory, not a spoiler.",
    'Respond with JSON only: { "topicSummary": string, "keyIdeas": string[] }',
    "topicSummary: 2–5 sentences. keyIdeas: 1–4 short bullets.",
  ].join(" ");
}

export function buildLearnMoreUserPrompt(params: {
  prompt: string;
  choices: string[];
  objectiveStatement?: string | null;
  pdfText: string;
  truncated: boolean;
  maxChars: number;
}): string {
  const note = params.truncated
    ? `\n[PDF text truncated to ${params.maxChars} characters. No embeddings/vector search.]`
    : "\n[Grounding uses PDF text only — no embeddings/vector DB.]";

  const choices = params.choices
    .map((c, i) => `${i}. ${c}`)
    .join("\n");

  const objective = params.objectiveStatement
    ? `\nRelated learning objective: ${params.objectiveStatement}\n`
    : "";

  return [
    "The student wants to learn more about the topic behind this question.",
    objective,
    `Question: ${params.prompt}`,
    "Choices (for context only — never identify which is correct):",
    choices,
    note,
    "",
    "--- PDF TEXT ---",
    params.pdfText,
    "--- END ---",
  ].join("\n");
}
