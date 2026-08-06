import { getMaxQuizSourceChars } from "@/lib/env";

export function truncatePdfTextForHint(extractedText: string): {
  text: string;
  truncated: boolean;
  maxChars: number;
} {
  const maxChars = Math.min(getMaxQuizSourceChars(), 20_000);
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

export function buildHintSystemPrompt(): string {
  return [
    "You are a Socratic tutor helping a student who missed a multiple-choice question.",
    "Write ONE short hint that guides thinking without revealing the answer.",
    "Hard rules:",
    "- Do NOT say which choice is correct (A/B/C/D or 1–4).",
    "- Do NOT quote or paraphrase any answer choice in a way that identifies the correct one.",
    "- Do NOT restate the correct fact as a giveaway.",
    "- Point the student back to a relevant idea in the PDF text.",
    "- Keep the hint useful but incomplete.",
    'Respond with JSON only: { "hint": string }',
  ].join(" ");
}

export function buildHintUserPrompt(params: {
  prompt: string;
  choices: string[];
  pdfText: string;
  truncated: boolean;
  maxChars: number;
}): string {
  const note = params.truncated
    ? `\n[PDF text truncated to ${params.maxChars} characters.]`
    : "";
  const choices = params.choices
    .map((c, i) => `${i}. ${c}`)
    .join("\n");

  return [
    "The student answered incorrectly. Provide a hint.",
    "",
    `Question: ${params.prompt}`,
    "Choices (for your awareness only — do not reveal which is correct):",
    choices,
    note,
    "",
    "--- PDF TEXT ---",
    params.pdfText,
    "--- END ---",
  ].join("\n");
}
