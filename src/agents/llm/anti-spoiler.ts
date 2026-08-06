/**
 * Reject LLM text that verbatim includes the correct MCQ choice (anti-spoiler).
 */
export function assertDoesNotContainCorrectChoice(
  text: string,
  correctChoiceText: string,
  label = "Output",
): void {
  const forbidden = correctChoiceText.trim().toLowerCase();
  if (forbidden.length >= 4 && text.toLowerCase().includes(forbidden)) {
    throw new Error(
      `${label} rejected: contained the correct choice text verbatim.`,
    );
  }
}
