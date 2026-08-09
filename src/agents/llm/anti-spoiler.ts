/**
 * Reject LLM text that leaks the correct MCQ choice (anti-spoiler).
 *
 * Modes:
 * - "strict" (hints): long choices (≥12 chars) must not appear verbatim;
 *   shorter choices only fail on explicit giveaway phrasing.
 * - "giveaway" (learn-more): only explicit “answer is …” style phrasing,
 *   because teaching the topic often requires the same words as the choice.
 */
export function assertDoesNotContainCorrectChoice(
  text: string,
  correctChoiceText: string,
  label = "Output",
  mode: "strict" | "giveaway" = "strict",
): void {
  const forbidden = correctChoiceText.trim().toLowerCase();
  if (forbidden.length < 4) {
    return;
  }

  const hay = text.toLowerCase();

  if (mode === "strict" && forbidden.length >= 12 && hay.includes(forbidden)) {
    throw new Error(
      `${label} rejected: contained the correct choice text verbatim.`,
    );
  }

  const giveaways = [
    `answer is ${forbidden}`,
    `answer is: ${forbidden}`,
    `correct answer is ${forbidden}`,
    `correct choice is ${forbidden}`,
    `correct option is ${forbidden}`,
    `the right answer is ${forbidden}`,
  ];
  if (giveaways.some((g) => hay.includes(g))) {
    throw new Error(
      `${label} rejected: revealed the correct choice explicitly.`,
    );
  }
}
