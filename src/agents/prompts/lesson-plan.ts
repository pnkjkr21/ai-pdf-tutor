import { getMaxPlanSourceChars } from "@/lib/env";
import {
  getPlanRegenerateGoalInstruction,
  type PlanRegenerateGoal,
} from "@/agents/schemas/lesson-plan";

export type PreviousLessonPlan = {
  title: string;
  difficulty: string;
  summary: string | null;
  objectives: string[];
};

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

export function buildLessonPlanSystemPrompt(isRevision = false): string {
  const revision = isRevision
    ? [
        "When a previous plan is provided, you MUST produce a meaningfully DIFFERENT revised plan.",
        "Do not paraphrase objectives one-for-one or keep the same title/summary with cosmetic edits.",
        "Change emphasis, sequencing, and wording; still stay grounded only in the PDF.",
        "When a learner goal is provided, prioritize that goal while revising.",
      ].join(" ")
    : "";

  return [
    "You are an instructional designer creating a lesson plan from a single PDF.",
    "Use ONLY the provided PDF text. Do not invent facts, topics, or examples that are not supported by that text.",
    "Objectives must be teachable from the provided text alone.",
    revision,
    "Respond with a single JSON object only (no markdown fences) matching this shape:",
    '{ "title": string, "difficulty": "BEGINNER"|"INTERMEDIATE"|"ADVANCED", "summary": string|null, "objectives": string[] }',
    "Provide 3 to 6 clear, specific learning objectives (ordered from foundational to advanced).",
    "Keep the title concise. Summary should be 1-3 sentences or null.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildLessonPlanUserPrompt(params: {
  pdfText: string;
  truncated: boolean;
  maxChars: number;
  previousPlan?: PreviousLessonPlan;
  regenerateGoal?: PlanRegenerateGoal;
}): string {
  const note = params.truncated
    ? `\n\n[Note: PDF text was truncated to the first ${params.maxChars} characters for model context.]`
    : "";

  const previous = params.previousPlan;
  if (!previous) {
    return `Create a lesson plan grounded only in the following PDF text.${note}\n\n--- PDF TEXT START ---\n${params.pdfText}\n--- PDF TEXT END ---`;
  }

  const objectivesBlock = previous.objectives
    .map((statement, i) => `${i + 1}. ${statement}`)
    .join("\n");

  const goalBlock = params.regenerateGoal
    ? [
        "",
        "--- LEARNER GOAL (highest priority while revising) ---",
        getPlanRegenerateGoalInstruction(params.regenerateGoal),
        "--- END LEARNER GOAL ---",
      ]
    : [];

  return [
    "Create a REVISED lesson plan that is clearly different from the previous one.",
    "Hard requirements:",
    "- Do NOT copy or lightly rephrase the previous title, summary, or objectives.",
    "- Rewrite every objective with substantially different wording and a shifted focus (skill, concept, or application).",
    "- Prefer a different objective count when the PDF supports it (still 3-6), or a different sequence of skills.",
    "- Title and summary must also change meaningfully.",
    "- Stay grounded only in the PDF text below.",
    "Treat the previous plan as a draft to improve and diverge from — not a template to echo.",
    "Still return the required JSON shape with 3-6 objectives.",
    ...goalBlock,
    note,
    "",
    "--- PREVIOUS PLAN (do not echo) ---",
    `Title: ${previous.title}`,
    `Difficulty: ${previous.difficulty}`,
    `Summary: ${previous.summary?.trim() ? previous.summary.trim() : "(none)"}`,
    "Objectives:",
    objectivesBlock,
    "--- END PREVIOUS PLAN ---",
    "",
    "--- PDF TEXT START ---",
    params.pdfText,
    "--- PDF TEXT END ---",
  ].join("\n");
}
