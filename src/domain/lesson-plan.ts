import { generateLessonPlanFromPdfText } from "@/agents/llm/deepseek";
import {
  lessonPlanEditSchema,
  planRegenerateGoalSchema,
  type LessonPlanEditInput,
  type PlanRegenerateGoal,
} from "@/agents/schemas/lesson-plan";
import {
  lessonRepository,
  type LessonWithPlan,
} from "@/db/repositories/lesson-repository";
import { PlanDomainError } from "@/domain/errors";
import { toQuizClientSummary } from "@/domain/quiz-generate";

export { PlanDomainError } from "@/domain/errors";

function requireLesson(lesson: LessonWithPlan | null, lessonId: string): LessonWithPlan {
  if (!lesson) {
    throw new PlanDomainError("NOT_FOUND", `Lesson not found: ${lessonId}`, 404);
  }
  return lesson;
}

function requireExtractedText(lesson: LessonWithPlan): string {
  const text = lesson.pdfAsset?.extractedText?.trim() ?? "";
  if (!text) {
    throw new PlanDomainError(
      "MISSING_TEXT",
      "Lesson has no extracted PDF text. Re-upload a text-based PDF.",
      400,
    );
  }
  return text;
}

export function toPlanClientPayload(lesson: LessonWithPlan) {
  const quiz = toQuizClientSummary(lesson);

  return {
    ok: true as const,
    lessonId: lesson.id,
    status: lesson.status,
    title: lesson.title,
    difficulty: lesson.difficulty,
    plan: lesson.plan
      ? {
          title: lesson.plan.title,
          difficulty: lesson.plan.difficulty,
          summary: lesson.plan.summary,
          approvedAt: lesson.plan.approvedAt
            ? lesson.plan.approvedAt.toISOString()
            : null,
          objectives: lesson.objectives.map((o) => ({
            id: o.id,
            orderIndex: o.orderIndex,
            statement: o.statement,
          })),
        }
      : null,
    questionCount: quiz.questionCount,
    quiz: {
      questionCount: quiz.questionCount,
      objectiveCount: quiz.objectiveCount,
      objectivesCovered: quiz.objectivesCovered,
      // Safe fields only — no correctIndex / explanation
      questions: quiz.questions,
      progress: quiz.progress,
    },
  };
}

/**
 * Generate a pending plan from PARSED lesson PDF text.
 * On LLM failure: leave status as PARSED (recoverable). No partial objectives.
 */
export async function generatePlanForLesson(
  lessonId: string,
): Promise<LessonWithPlan> {
  const lesson = requireLesson(await lessonRepository.findById(lessonId), lessonId);

  if (lesson.status !== "PARSED") {
    throw new PlanDomainError(
      "INVALID_STATUS",
      `Cannot generate plan from status ${lesson.status}. Expected PARSED.`,
      409,
    );
  }

  const extractedText = requireExtractedText(lesson);

  let llmPlan;
  try {
    llmPlan = await generateLessonPlanFromPdfText(extractedText);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DeepSeek plan generation failed.";
    // Recoverable: stay PARSED, no junk rows.
    throw new PlanDomainError("LLM_FAILED", message, 502);
  }

  return lessonRepository.replacePendingPlan(lessonId, {
    title: llmPlan.title,
    difficulty: llmPlan.difficulty,
    summary: llmPlan.summary?.trim() ? llmPlan.summary.trim() : null,
    rawPlanJson: llmPlan,
    objectives: llmPlan.objectives,
  });
}

/**
 * Replace pending plan with a DeepSeek revision of the current pending plan.
 * Passes the saved plan + learner goal as context. Keeps old plan if LLM fails.
 */
export async function regeneratePlanForLesson(
  lessonId: string,
  rawGoal: unknown,
): Promise<LessonWithPlan> {
  const lesson = requireLesson(await lessonRepository.findById(lessonId), lessonId);

  if (lesson.status !== "PLAN_PENDING_APPROVAL") {
    throw new PlanDomainError(
      "INVALID_STATUS",
      `Cannot regenerate unless status is PLAN_PENDING_APPROVAL (got ${lesson.status}).`,
      409,
    );
  }

  if (!lesson.plan || lesson.objectives.length === 0) {
    throw new PlanDomainError(
      "NO_PLAN",
      "No pending plan to revise. Generate a plan first.",
      409,
    );
  }

  let regenerateGoal: PlanRegenerateGoal;
  try {
    regenerateGoal = planRegenerateGoalSchema.parse(rawGoal);
  } catch {
    throw new PlanDomainError(
      "INVALID_BODY",
      "Choose a regenerate goal: easier, more_challenging, shorter, deeper_coverage, or skip_known_topics.",
      400,
    );
  }

  const extractedText = requireExtractedText(lesson);
  const previousPlan = {
    title: lesson.plan.title,
    difficulty: lesson.plan.difficulty,
    summary: lesson.plan.summary,
    objectives: [...lesson.objectives]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => o.statement),
  };

  let llmPlan;
  try {
    llmPlan = await generateLessonPlanFromPdfText(extractedText, {
      previousPlan,
      regenerateGoal,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DeepSeek plan regeneration failed.";
    // Keep existing pending plan.
    throw new PlanDomainError("LLM_FAILED", message, 502);
  }

  return lessonRepository.replacePendingPlan(lessonId, {
    title: llmPlan.title,
    difficulty: llmPlan.difficulty,
    summary: llmPlan.summary?.trim() ? llmPlan.summary.trim() : null,
    rawPlanJson: llmPlan,
    objectives: llmPlan.objectives,
  });
}

export async function updatePendingPlan(
  lessonId: string,
  rawEdits: unknown,
): Promise<LessonWithPlan> {
  const lesson = requireLesson(await lessonRepository.findById(lessonId), lessonId);

  if (lesson.status !== "PLAN_PENDING_APPROVAL" || !lesson.plan) {
    throw new PlanDomainError(
      "INVALID_STATUS",
      "Can only edit a plan that is pending approval.",
      409,
    );
  }

  if (lesson.plan.approvedAt) {
    throw new PlanDomainError(
      "ALREADY_APPROVED",
      "Plan is already approved and cannot be edited.",
      409,
    );
  }

  let edits: LessonPlanEditInput;
  try {
    edits = lessonPlanEditSchema.parse(rawEdits);
  } catch {
    throw new PlanDomainError(
      "INVALID_BODY",
      "Invalid plan edits. Need title, difficulty, and 3–6 objectives.",
      400,
    );
  }

  return lessonRepository.updatePendingPlanEdits(lessonId, {
    title: edits.title,
    difficulty: edits.difficulty,
    summary: edits.summary?.trim() ? edits.summary.trim() : null,
    objectives: edits.objectives,
  });
}

/**
 * Approve pending plan. Hard gate: does NOT generate MCQs / Question rows.
 */
export async function approvePlanForLesson(
  lessonId: string,
): Promise<LessonWithPlan> {
  const lesson = requireLesson(await lessonRepository.findById(lessonId), lessonId);

  if (lesson.status !== "PLAN_PENDING_APPROVAL" || !lesson.plan) {
    throw new PlanDomainError(
      "INVALID_STATUS",
      `Cannot approve from status ${lesson.status}. Expected PLAN_PENDING_APPROVAL.`,
      409,
    );
  }

  if (lesson.plan.approvedAt) {
    throw new PlanDomainError(
      "ALREADY_APPROVED",
      "Plan is already approved.",
      409,
    );
  }

  const approved = await lessonRepository.approvePlan(lessonId);

  if (approved._count.questions > 0) {
    // Should never happen in Step 3; guardrail for later regressions.
    throw new PlanDomainError(
      "UNEXPECTED_QUESTIONS",
      "Approve must not create questions; unexpected Question rows found.",
      500,
    );
  }

  return approved;
}

export async function getLessonForClient(lessonId: string): Promise<LessonWithPlan> {
  return requireLesson(await lessonRepository.findById(lessonId), lessonId);
}
