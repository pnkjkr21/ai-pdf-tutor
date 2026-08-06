import { generateMcqsFromPdfText } from "@/agents/llm/deepseek";
import type { McqItemLlm } from "@/agents/schemas/mcq";
import type { SafeQuestion } from "@/agents/schemas/mcq";
import { PlanDomainError } from "@/domain/errors";
import {
  lessonRepository,
  type LessonWithPlan,
} from "@/db/repositories/lesson-repository";

function requireLesson(
  lesson: LessonWithPlan | null,
  lessonId: string,
): LessonWithPlan {
  if (!lesson) {
    throw new PlanDomainError("NOT_FOUND", `Lesson not found: ${lessonId}`, 404);
  }
  return lesson;
}

function parseChoicesJson(value: unknown): [string, string, string, string] {
  if (!Array.isArray(value) || value.length !== 4) {
    return ["", "", "", ""];
  }
  return value.map((c) => String(c)) as [string, string, string, string];
}

/** Safe client questions — strips correctIndex and explanation. */
export function toSafeQuestions(lesson: LessonWithPlan): SafeQuestion[] {
  const objectiveOrder = new Map(
    lesson.objectives.map((o) => [o.id, o.orderIndex]),
  );

  return lesson.questions.map((q) => ({
    id: q.id,
    orderIndex: q.orderIndex,
    objectiveId: q.objectiveId,
    objectiveOrderIndex: objectiveOrder.get(q.objectiveId) ?? 0,
    prompt: q.prompt,
    choices: parseChoicesJson(q.choicesJson),
  }));
}

export function toQuizClientSummary(lesson: LessonWithPlan) {
  const safeQuestions = toSafeQuestions(lesson);
  const covered = new Set(safeQuestions.map((q) => q.objectiveId)).size;

  return {
    questionCount: safeQuestions.length,
    objectiveCount: lesson.objectives.length,
    objectivesCovered: covered,
    questions: safeQuestions,
    progress: lesson.progress
      ? {
          currentQuestionIndex: lesson.progress.currentQuestionIndex,
          questionsCompleted: lesson.progress.questionsCompleted,
        }
      : null,
  };
}

function assertCoverage(
  items: McqItemLlm[],
  objectives: LessonWithPlan["objectives"],
): void {
  const byOrder = new Map(objectives.map((o) => [o.orderIndex, o]));
  const counts = new Map<number, number>();

  for (const item of items) {
    if (!byOrder.has(item.objectiveOrderIndex)) {
      throw new PlanDomainError(
        "INVALID_LLM_OUTPUT",
        `MCQ references unknown objectiveOrderIndex ${item.objectiveOrderIndex}.`,
        502,
      );
    }
    if (item.correctIndex < 0 || item.correctIndex > 3) {
      throw new PlanDomainError(
        "INVALID_LLM_OUTPUT",
        "MCQ correctIndex must be 0–3.",
        502,
      );
    }
    const uniqueChoices = new Set(item.choices.map((c) => c.trim().toLowerCase()));
    if (uniqueChoices.size < 4) {
      throw new PlanDomainError(
        "INVALID_LLM_OUTPUT",
        "MCQ choices must be four distinct options.",
        502,
      );
    }
    counts.set(
      item.objectiveOrderIndex,
      (counts.get(item.objectiveOrderIndex) ?? 0) + 1,
    );
  }

  for (const objective of objectives) {
    const n = counts.get(objective.orderIndex) ?? 0;
    if (n < 1) {
      throw new PlanDomainError(
        "INVALID_LLM_OUTPUT",
        `Missing MCQ for objective ${objective.orderIndex}.`,
        502,
      );
    }
    if (n > 2) {
      throw new PlanDomainError(
        "INVALID_LLM_OUTPUT",
        `Too many MCQs for objective ${objective.orderIndex} (max 2).`,
        502,
      );
    }
  }

  if (items.length > 12) {
    throw new PlanDomainError(
      "INVALID_LLM_OUTPUT",
      "Too many MCQs generated (max 12).",
      502,
    );
  }
}

/**
 * Generate MCQs once for a PLAN_APPROVED lesson.
 * Idempotency: rejects if questions already exist (no silent duplicates).
 * On LLM failure: leave PLAN_APPROVED; transaction ensures no partial questions.
 */
export async function generateQuizForLesson(
  lessonId: string,
): Promise<LessonWithPlan> {
  const lesson = requireLesson(await lessonRepository.findById(lessonId), lessonId);

  // Check existing questions before status so QUIZ_READY re-calls return ALREADY_GENERATED.
  if (lesson._count.questions > 0 || lesson.questions.length > 0) {
    throw new PlanDomainError(
      "ALREADY_GENERATED",
      "Quiz questions already exist for this lesson. Generation is one-shot (no silent duplicates).",
      409,
    );
  }

  if (lesson.status !== "PLAN_APPROVED") {
    throw new PlanDomainError(
      "INVALID_STATUS",
      `Cannot generate quiz from status ${lesson.status}. Expected PLAN_APPROVED.`,
      409,
    );
  }

  if (!lesson.plan?.approvedAt) {
    throw new PlanDomainError(
      "NOT_APPROVED",
      "Lesson plan must be approved before quiz generation.",
      409,
    );
  }

  if (lesson.objectives.length === 0) {
    throw new PlanDomainError(
      "NO_OBJECTIVES",
      "Lesson has no learning objectives.",
      400,
    );
  }

  const extractedText = lesson.pdfAsset?.extractedText?.trim() ?? "";
  if (!extractedText) {
    throw new PlanDomainError(
      "MISSING_TEXT",
      "Lesson has no extracted PDF text.",
      400,
    );
  }

  let llmOutput;
  try {
    llmOutput = await generateMcqsFromPdfText({
      title: lesson.plan.title,
      difficulty: lesson.plan.difficulty,
      objectives: lesson.objectives.map((o) => ({
        orderIndex: o.orderIndex,
        statement: o.statement,
      })),
      extractedText,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DeepSeek MCQ generation failed.";
    throw new PlanDomainError("LLM_FAILED", message, 502);
  }

  try {
    assertCoverage(llmOutput.questions, lesson.objectives);
  } catch (error) {
    if (error instanceof PlanDomainError) {
      throw error;
    }
    throw error;
  }

  const byOrder = new Map(
    lesson.objectives.map((o) => [o.orderIndex, o] as const),
  );

  const rows = llmOutput.questions.map((item, orderIndex) => {
    const objective = byOrder.get(item.objectiveOrderIndex);
    if (!objective) {
      throw new PlanDomainError(
        "INVALID_LLM_OUTPUT",
        `Unknown objectiveOrderIndex ${item.objectiveOrderIndex}.`,
        502,
      );
    }
    return {
      objectiveId: objective.id,
      orderIndex,
      prompt: item.prompt,
      choices: item.choices,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
    };
  });

  try {
    return await lessonRepository.createQuizReady({
      lessonId,
      questions: rows,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to persist quiz.";
    if (/already exist/i.test(message)) {
      throw new PlanDomainError("ALREADY_GENERATED", message, 409);
    }
    throw new PlanDomainError("PERSIST_FAILED", message, 500);
  }
}
