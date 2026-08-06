import { generateStudyTipsFromPdfText } from "@/agents/llm/deepseek";
import {
  completionMetricsSchema,
  completionReportSchema,
  type CompletionMetrics,
  type CompletionReport,
} from "@/agents/schemas/study-tips";
import { PlanDomainError } from "@/domain/errors";
import {
  quizRepository,
  type LessonQuizState,
} from "@/db/repositories/quiz-repository";

const STRONG_ACCURACY_THRESHOLD = 0.75;
const WEAK_ACCURACY_THRESHOLD = 0.5;

function requireCompletedLesson(
  lesson: LessonQuizState | null,
  lessonId: string,
): LessonQuizState {
  if (!lesson) {
    throw new PlanDomainError("NOT_FOUND", `Lesson not found: ${lessonId}`, 404);
  }
  if (lesson.status !== "COMPLETED") {
    throw new PlanDomainError(
      "NOT_COMPLETED",
      `Completion report requires COMPLETED status (got ${lesson.status}).`,
      409,
    );
  }
  if (!lesson.progress) {
    throw new PlanDomainError(
      "NO_PROGRESS",
      "LessonProgress missing for completed lesson.",
      500,
    );
  }
  if (lesson.questions.length === 0) {
    throw new PlanDomainError("NO_QUESTIONS", "No questions for this lesson.", 400);
  }
  return lesson;
}

function attemptsForQuestion(lesson: LessonQuizState, questionId: string) {
  return lesson.attempts.filter((a) => a.questionId === questionId);
}

/**
 * Deterministic completion metrics from attempts + objectives (never LLM).
 * Strong = high first-try success; weak = many misses/retries.
 */
export function buildCompletionMetrics(
  lesson: LessonQuizState,
): CompletionMetrics {
  const progress = lesson.progress!;
  const questionsTotal = lesson.questions.length;
  const objectivesTotal = lesson.objectives.length;

  const areas = lesson.objectives.map((objective) => {
    const qs = lesson.questions.filter((q) => q.objectiveId === objective.id);
    let firstAttemptCorrect = 0;
    let incorrectAttempts = 0;

    for (const q of qs) {
      const attempts = attemptsForQuestion(lesson, q.id);
      const first = attempts.find((a) => a.isFirstAttempt) ?? attempts[0];
      if (first?.outcome === "CORRECT") {
        firstAttemptCorrect += 1;
      }
      incorrectAttempts += attempts.filter((a) => a.outcome === "INCORRECT")
        .length;
    }

    const questionCount = qs.length;
    const firstAttemptAccuracy =
      questionCount === 0 ? 0 : firstAttemptCorrect / questionCount;

    return {
      objectiveId: objective.id,
      orderIndex: objective.orderIndex,
      statement: objective.statement,
      questionCount,
      firstAttemptCorrect,
      incorrectAttempts,
      firstAttemptAccuracy: Number(firstAttemptAccuracy.toFixed(4)),
    };
  });

  const strongAreas = areas.filter(
    (a) =>
      a.questionCount > 0 &&
      a.firstAttemptAccuracy >= STRONG_ACCURACY_THRESHOLD &&
      a.incorrectAttempts === 0,
  );
  const weakAreas = areas.filter(
    (a) =>
      a.questionCount > 0 &&
      (a.incorrectAttempts > 0 ||
        a.firstAttemptAccuracy < WEAK_ACCURACY_THRESHOLD),
  );

  const firstAttemptCorrect = progress.firstAttemptCorrect;
  const firstAttemptAccuracy =
    questionsTotal === 0
      ? 0
      : Number((firstAttemptCorrect / questionsTotal).toFixed(4));

  return completionMetricsSchema.parse({
    objectivesCompleted: progress.objectivesCompleted,
    objectivesTotal,
    questionsCompleted: progress.questionsCompleted,
    questionsTotal,
    firstAttemptCorrect,
    firstAttemptAccuracy,
    totalAttempts: progress.totalAttempts,
    retries: progress.retryCount,
    strongAreas,
    weakAreas,
  });
}

function parseStoredReport(value: unknown): CompletionReport | null {
  if (value == null) {
    return null;
  }
  const parsed = completionReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function metricsSummaryLine(metrics: CompletionMetrics): string {
  const pct = Math.round(metrics.firstAttemptAccuracy * 100);
  return [
    `Metrics (computed by the app, not the model):`,
    `- Objectives completed: ${metrics.objectivesCompleted}/${metrics.objectivesTotal}`,
    `- Questions completed: ${metrics.questionsCompleted}/${metrics.questionsTotal}`,
    `- First-attempt accuracy: ${pct}% (${metrics.firstAttemptCorrect}/${metrics.questionsTotal})`,
    `- Total attempts: ${metrics.totalAttempts}`,
    `- Retries: ${metrics.retries}`,
  ].join("\n");
}

/**
 * Load or create a completion report. Idempotent when report already exists
 * unless forceRegenerate is true. Never mutates quiz attempts / COMPLETED status.
 */
export async function generateCompletionReport(
  lessonId: string,
  options?: { forceRegenerate?: boolean },
): Promise<{ report: CompletionReport; regenerated: boolean }> {
  const lesson = requireCompletedLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );

  const existing = parseStoredReport(lesson.progress?.reportJson);
  if (existing && !options?.forceRegenerate) {
    return { report: existing, regenerated: false };
  }

  const metrics = buildCompletionMetrics(lesson);
  const title =
    lesson.plan?.title?.trim() ||
    lesson.pdfAsset?.originalName?.replace(/\.pdf$/i, "") ||
    "Lesson";

  let studyTips;
  try {
    studyTips = await generateStudyTipsFromPdfText({
      title,
      strongAreas: metrics.strongAreas.map((a) => ({
        orderIndex: a.orderIndex,
        statement: a.statement,
      })),
      weakAreas: metrics.weakAreas.map((a) => ({
        orderIndex: a.orderIndex,
        statement: a.statement,
      })),
      metricsSummary: metricsSummaryLine(metrics),
      extractedText: lesson.pdfAsset?.extractedText ?? "",
    });
  } catch (error) {
    throw new PlanDomainError(
      "LLM_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to generate study tips.",
      502,
    );
  }

  const report = completionReportSchema.parse({
    metrics,
    studyTips,
    generatedAt: new Date().toISOString(),
  });

  await quizRepository.saveCompletionReport({
    lessonId,
    reportJson: report,
  });

  return { report, regenerated: true };
}

export async function getCompletionReport(lessonId: string) {
  return generateCompletionReport(lessonId, { forceRegenerate: false });
}
