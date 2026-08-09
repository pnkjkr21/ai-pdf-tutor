import { z } from "zod";

import { generateQuizHint, generateQuizLearnMore } from "@/agents/llm/deepseek";
import { PlanDomainError } from "@/domain/errors";
import {
  quizRepository,
  type LessonQuizState,
} from "@/db/repositories/quiz-repository";

function parseChoices(value: unknown): [string, string, string, string] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new PlanDomainError(
      "INVALID_QUESTION",
      "Question choices are malformed.",
      500,
    );
  }
  return value.map((c) => String(c)) as [string, string, string, string];
}

function requireQuizLesson(lesson: LessonQuizState | null, lessonId: string) {
  if (!lesson) {
    throw new PlanDomainError("NOT_FOUND", `Lesson not found: ${lessonId}`, 404);
  }
  if (
    lesson.status !== "QUIZ_READY" &&
    lesson.status !== "IN_PROGRESS" &&
    lesson.status !== "COMPLETED"
  ) {
    throw new PlanDomainError(
      "INVALID_STATUS",
      `Quiz play requires QUIZ_READY or IN_PROGRESS (got ${lesson.status}).`,
      409,
    );
  }
  if (!lesson.progress) {
    throw new PlanDomainError(
      "NO_PROGRESS",
      "LessonProgress missing. Generate the quiz first.",
      400,
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

function hasCorrectAttempt(lesson: LessonQuizState, questionId: string) {
  return attemptsForQuestion(lesson, questionId).some(
    (a) => a.outcome === "CORRECT",
  );
}

function completedQuestionIds(lesson: LessonQuizState): Set<string> {
  const ids = new Set<string>();
  for (const q of lesson.questions) {
    if (hasCorrectAttempt(lesson, q.id)) {
      ids.add(q.id);
    }
  }
  return ids;
}

function objectiveFullyComplete(
  lesson: LessonQuizState,
  objectiveId: string,
  completedIds: Set<string>,
): boolean {
  const qs = lesson.questions.filter((q) => q.objectiveId === objectiveId);
  return qs.length > 0 && qs.every((q) => completedIds.has(q.id));
}

export type QuizPhase = "unanswered" | "incorrect" | "correct" | "finished";

export type SafeCurrentQuestion = {
  id: string;
  orderIndex: number;
  objectiveId: string;
  objectiveOrderIndex: number;
  prompt: string;
  choices: [string, string, string, string];
};

export function buildProgressView(lesson: LessonQuizState) {
  const progress = lesson.progress!;
  const totalQuestions = lesson.questions.length;
  const totalObjectives = lesson.objectives.length;
  const completedIds = completedQuestionIds(lesson);
  const current =
    lesson.questions.find((q) => q.orderIndex === progress.currentQuestionIndex) ??
    null;

  const objectiveOrder = current
    ? (lesson.objectives.find((o) => o.id === current.objectiveId)?.orderIndex ??
      0)
    : progress.currentObjectiveIndex;

  return {
    status: lesson.status,
    currentQuestionIndex: progress.currentQuestionIndex,
    currentObjectiveIndex: objectiveOrder,
    questionPosition: Math.min(progress.currentQuestionIndex + 1, totalQuestions),
    questionTotal: totalQuestions,
    objectivePosition: Math.min(objectiveOrder + 1, totalObjectives || 1),
    objectiveTotal: totalObjectives,
    questionsCompleted: progress.questionsCompleted,
    objectivesCompleted: progress.objectivesCompleted,
    firstAttemptCorrect: progress.firstAttemptCorrect,
    totalAttempts: progress.totalAttempts,
    retryCount: progress.retryCount,
    completedAt: progress.completedAt?.toISOString() ?? null,
    completedQuestionCount: completedIds.size,
  };
}

function toSafeQuestion(
  lesson: LessonQuizState,
  question: LessonQuizState["questions"][number],
): SafeCurrentQuestion {
  const objectiveOrderIndex =
    lesson.objectives.find((o) => o.id === question.objectiveId)?.orderIndex ?? 0;
  return {
    id: question.id,
    orderIndex: question.orderIndex,
    objectiveId: question.objectiveId,
    objectiveOrderIndex,
    prompt: question.prompt,
    choices: parseChoices(question.choicesJson),
  };
}

export function getQuizPhase(lesson: LessonQuizState): {
  phase: QuizPhase;
  question: SafeCurrentQuestion | null;
  selectedIndex: number | null;
  explanation: string | null;
} {
  const progress = lesson.progress!;
  const completedIds = completedQuestionIds(lesson);
  const finished =
    lesson.status === "COMPLETED" ||
    completedIds.size >= lesson.questions.length ||
    progress.questionsCompleted >= lesson.questions.length;

  if (finished && progress.currentQuestionIndex >= lesson.questions.length - 1) {
    const allDone =
      completedIds.size >= lesson.questions.length ||
      lesson.status === "COMPLETED";
    if (allDone && (lesson.status === "COMPLETED" || progress.completedAt)) {
      return {
        phase: "finished",
        question: null,
        selectedIndex: null,
        explanation: null,
      };
    }
  }

  const current =
    lesson.questions.find((q) => q.orderIndex === progress.currentQuestionIndex) ??
    null;

  if (!current) {
    return {
      phase: "finished",
      question: null,
      selectedIndex: null,
      explanation: null,
    };
  }

  const attempts = attemptsForQuestion(lesson, current.id);
  const correct = attempts.find((a) => a.outcome === "CORRECT");
  if (correct) {
    return {
      phase: "correct",
      question: toSafeQuestion(lesson, current),
      selectedIndex: correct.selectedIndex,
      explanation: current.explanation,
    };
  }

  const lastIncorrect = [...attempts]
    .reverse()
    .find((a) => a.outcome === "INCORRECT");
  if (lastIncorrect) {
    return {
      phase: "incorrect",
      question: toSafeQuestion(lesson, current),
      selectedIndex: lastIncorrect.selectedIndex,
      explanation: null,
    };
  }

  return {
    phase: "unanswered",
    question: toSafeQuestion(lesson, current),
    selectedIndex: null,
    explanation: null,
  };
}

export async function getCurrentQuiz(lessonId: string) {
  const lesson = requireQuizLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );
  const view = getQuizPhase(lesson);
  const finished =
    view.phase === "finished" ||
    (lesson.status === "COMPLETED" &&
      completedQuestionIds(lesson).size >= lesson.questions.length);

  return {
    ok: true as const,
    lessonId,
    phase: finished ? ("finished" as const) : view.phase,
    question: finished ? null : view.question,
    selectedIndex: finished ? null : view.selectedIndex,
    // Explanation only when this question was answered correctly
    explanation: view.phase === "correct" ? view.explanation : null,
    progress: buildProgressView(lesson),
    message: finished
      ? "Lesson complete. See your performance report below."
      : undefined,
  };
}

export type ReviewedAttempt = {
  selectedIndex: number;
  outcome: "CORRECT" | "INCORRECT";
  isFirstAttempt: boolean;
  hintRequested: boolean;
  learnMoreRequested: boolean;
  createdAt: string;
};

export type ReviewedQuestion = {
  questionId: string;
  orderIndex: number;
  questionNumber: number;
  objectiveId: string;
  objectiveOrderIndex: number;
  objectiveStatement: string | null;
  prompt: string;
  choices: [string, string, string, string];
  /** Safe to expose: this question already has a CORRECT attempt. */
  correctIndex: number;
  explanation: string;
  attempts: ReviewedAttempt[];
  attemptCount: number;
  solvedFirstTry: boolean;
};

/**
 * Read-only trail of questions the learner has already answered correctly, so
 * they can look back mid-quiz. Unsolved questions are never included — their
 * `correctIndex` / `explanation` must stay server-side.
 */
export async function getQuizHistory(lessonId: string) {
  const lesson = requireQuizLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );

  const objectiveById = new Map(lesson.objectives.map((o) => [o.id, o]));
  const items: ReviewedQuestion[] = [];

  for (const question of lesson.questions) {
    const attempts = attemptsForQuestion(lesson, question.id);
    if (!attempts.some((a) => a.outcome === "CORRECT")) {
      continue;
    }

    const objective = objectiveById.get(question.objectiveId) ?? null;
    const firstAttempt = attempts.find((a) => a.isFirstAttempt) ?? attempts[0];

    items.push({
      questionId: question.id,
      orderIndex: question.orderIndex,
      questionNumber: question.orderIndex + 1,
      objectiveId: question.objectiveId,
      objectiveOrderIndex: objective?.orderIndex ?? 0,
      objectiveStatement: objective?.statement ?? null,
      prompt: question.prompt,
      choices: parseChoices(question.choicesJson),
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      attempts: attempts.map((a) => ({
        selectedIndex: a.selectedIndex,
        outcome: a.outcome,
        isFirstAttempt: a.isFirstAttempt,
        hintRequested: a.hintRequested,
        learnMoreRequested: a.learnMoreRequested,
        createdAt: a.createdAt.toISOString(),
      })),
      attemptCount: attempts.length,
      solvedFirstTry: firstAttempt?.outcome === "CORRECT",
    });
  }

  return {
    ok: true as const,
    lessonId,
    // Total questions in the quiz, so the UI can say "3 of 8 reviewed".
    questionTotal: lesson.questions.length,
    reviewedCount: items.length,
    currentQuestionIndex: lesson.progress!.currentQuestionIndex,
    questions: items,
  };
}

export const answerBodySchema = z.object({
  questionId: z.string().min(1),
  selectedIndex: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
});

export async function submitQuizAnswer(
  lessonId: string,
  rawBody: unknown,
) {
  const body = answerBodySchema.parse(rawBody);
  const lesson = requireQuizLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );

  if (lesson.status === "COMPLETED") {
    throw new PlanDomainError(
      "ALREADY_COMPLETED",
      "Lesson quiz is already completed.",
      409,
    );
  }

  const progress = lesson.progress!;
  const current = lesson.questions.find(
    (q) => q.orderIndex === progress.currentQuestionIndex,
  );
  if (!current || current.id !== body.questionId) {
    throw new PlanDomainError(
      "WRONG_QUESTION",
      "Answer does not match the current question.",
      409,
    );
  }

  if (hasCorrectAttempt(lesson, current.id)) {
    throw new PlanDomainError(
      "ALREADY_CORRECT",
      "This question was already answered correctly. Use Next.",
      409,
    );
  }

  const prior = attemptsForQuestion(lesson, current.id);
  const isFirstAttempt = prior.length === 0;
  const isCorrect = body.selectedIndex === current.correctIndex;

  let questionsCompleted = progress.questionsCompleted;
  let objectivesCompleted = progress.objectivesCompleted;
  let firstAttemptCorrect = progress.firstAttemptCorrect;
  let retryCount = progress.retryCount;
  let markObjectiveIdCompleted: string | null = null;

  const totalAttempts = progress.totalAttempts + 1;

  if (isCorrect) {
    if (isFirstAttempt) {
      firstAttemptCorrect += 1;
    }
    questionsCompleted += 1;

    const completedIds = completedQuestionIds(lesson);
    completedIds.add(current.id);
    if (
      objectiveFullyComplete(lesson, current.objectiveId, completedIds) &&
      !lesson.objectives.find((o) => o.id === current.objectiveId)?.completedAt
    ) {
      objectivesCompleted += 1;
      markObjectiveIdCompleted = current.objectiveId;
    }
  } else if (!isFirstAttempt) {
    retryCount += 1;
  } else {
    // first attempt incorrect still counts as a retry opportunity later;
    // retryCount increments on subsequent incorrects only per common UX.
    // Spec: "retries counted" — count this incorrect toward retryCount too.
    retryCount += 1;
  }

  const objectiveOrder =
    lesson.objectives.find((o) => o.id === current.objectiveId)?.orderIndex ??
    progress.currentObjectiveIndex;

  const updated = await quizRepository.recordAttemptAndProgress({
    lessonId,
    question: current,
    selectedIndex: body.selectedIndex,
    isCorrect,
    isFirstAttempt,
    hintRequested: !isCorrect,
    progressPatch: {
      totalAttempts,
      retryCount,
      firstAttemptCorrect,
      questionsCompleted,
      objectivesCompleted,
      currentObjectiveIndex: objectiveOrder,
      currentQuestionIndex: progress.currentQuestionIndex,
      markObjectiveIdCompleted,
      startInProgress: lesson.status === "QUIZ_READY",
    },
  });

  const choices = parseChoices(current.choicesJson);
  let hint: string | null = null;

  if (!isCorrect) {
    try {
      const hintOut = await generateQuizHint({
        prompt: current.prompt,
        choices: [...choices],
        correctChoiceText: choices[current.correctIndex] ?? "",
        extractedText: updated.pdfAsset?.extractedText ?? "",
      });
      hint = hintOut.hint;
      const lastAttempt = updated.attempts
        .filter((a) => a.questionId === current.id)
        .at(-1);
      if (lastAttempt) {
        await quizRepository.markHintRequested(lastAttempt.id);
      }
    } catch {
      hint =
        "Re-read the related section of the PDF and eliminate choices that contradict it. Think about the key definition or process named in the question.";
    }
  }

  return {
    ok: true as const,
    lessonId,
    outcome: isCorrect ? ("CORRECT" as const) : ("INCORRECT" as const),
    selectedIndex: body.selectedIndex,
    // Secrets: explanation only when correct; never correctIndex
    explanation: isCorrect ? current.explanation : null,
    hint: isCorrect ? null : hint,
    phase: isCorrect ? ("correct" as const) : ("incorrect" as const),
    question: toSafeQuestion(updated, current),
    progress: buildProgressView(updated),
    awaitingNext: isCorrect,
  };
}

export async function advanceQuiz(lessonId: string) {
  const lesson = requireQuizLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );

  if (lesson.status === "COMPLETED") {
    return {
      ok: true as const,
      lessonId,
      phase: "finished" as const,
      question: null,
      explanation: null,
      selectedIndex: null,
      progress: buildProgressView(lesson),
      message: "Lesson complete. See your performance report below.",
    };
  }

  const progress = lesson.progress!;
  const current = lesson.questions.find(
    (q) => q.orderIndex === progress.currentQuestionIndex,
  );
  if (!current) {
    throw new PlanDomainError("NO_CURRENT", "No current question to advance from.", 409);
  }
  if (!hasCorrectAttempt(lesson, current.id)) {
    throw new PlanDomainError(
      "NOT_CORRECT_YET",
      "Answer the current question correctly before continuing.",
      409,
    );
  }

  const isLast = progress.currentQuestionIndex >= lesson.questions.length - 1;
  if (isLast) {
    const updated = await quizRepository.advanceAfterCorrect({
      lessonId,
      nextQuestionIndex: progress.currentQuestionIndex,
      nextObjectiveIndex: progress.currentObjectiveIndex,
      finished: true,
    });
    return {
      ok: true as const,
      lessonId,
      phase: "finished" as const,
      question: null,
      explanation: null,
      selectedIndex: null,
      progress: buildProgressView(updated),
      message: "Lesson complete. See your performance report below.",
    };
  }

  const nextIndex = progress.currentQuestionIndex + 1;
  const nextQuestion = lesson.questions.find((q) => q.orderIndex === nextIndex);
  if (!nextQuestion) {
    throw new PlanDomainError("NO_NEXT", "Next question missing.", 500);
  }
  const nextObjectiveIndex =
    lesson.objectives.find((o) => o.id === nextQuestion.objectiveId)?.orderIndex ??
    progress.currentObjectiveIndex;

  const updated = await quizRepository.advanceAfterCorrect({
    lessonId,
    nextQuestionIndex: nextIndex,
    nextObjectiveIndex,
    finished: false,
  });

  const view = getQuizPhase(updated);
  return {
    ok: true as const,
    lessonId,
    phase: view.phase,
    question: view.question,
    selectedIndex: view.selectedIndex,
    explanation: view.phase === "correct" ? view.explanation : null,
    progress: buildProgressView(updated),
  };
}

export async function requestQuizHint(lessonId: string) {
  const lesson = requireQuizLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );
  const progress = lesson.progress!;
  const current = lesson.questions.find(
    (q) => q.orderIndex === progress.currentQuestionIndex,
  );
  if (!current) {
    throw new PlanDomainError("NO_CURRENT", "No current question.", 409);
  }
  if (hasCorrectAttempt(lesson, current.id)) {
    throw new PlanDomainError(
      "ALREADY_CORRECT",
      "Hints are only available after an incorrect answer.",
      409,
    );
  }
  const incorrect = attemptsForQuestion(lesson, current.id).filter(
    (a) => a.outcome === "INCORRECT",
  );
  if (incorrect.length === 0) {
    throw new PlanDomainError(
      "NO_INCORRECT",
      "Submit an incorrect answer before requesting a hint.",
      409,
    );
  }

  const choices = parseChoices(current.choicesJson);
  try {
    const hintOut = await generateQuizHint({
      prompt: current.prompt,
      choices: [...choices],
      correctChoiceText: choices[current.correctIndex] ?? "",
      extractedText: lesson.pdfAsset?.extractedText ?? "",
    });
    const last = incorrect.at(-1);
    if (last) {
      await quizRepository.markHintRequested(last.id);
    }
    return {
      ok: true as const,
      lessonId,
      questionId: current.id,
      hint: hintOut.hint,
    };
  } catch (error) {
    throw new PlanDomainError(
      "LLM_FAILED",
      error instanceof Error ? error.message : "Hint generation failed.",
      502,
    );
  }
}

const LEARN_MORE_GUIDE_BACK =
  "When you’re ready, retry the question above — the quiz has not moved on.";

/**
 * PDF-grounded mini-lesson for the current question after an incorrect attempt.
 * Does not advance the quiz cursor or reveal the answer.
 */
export async function requestQuizLearnMore(lessonId: string) {
  const lesson = requireQuizLesson(
    await quizRepository.findQuizState(lessonId),
    lessonId,
  );
  const progress = lesson.progress!;
  const current = lesson.questions.find(
    (q) => q.orderIndex === progress.currentQuestionIndex,
  );
  if (!current) {
    throw new PlanDomainError("NO_CURRENT", "No current question.", 409);
  }
  if (hasCorrectAttempt(lesson, current.id)) {
    throw new PlanDomainError(
      "ALREADY_CORRECT",
      "Learn more is available while retrying after an incorrect answer.",
      409,
    );
  }
  const incorrect = attemptsForQuestion(lesson, current.id).filter(
    (a) => a.outcome === "INCORRECT",
  );
  if (incorrect.length === 0) {
    throw new PlanDomainError(
      "NO_INCORRECT",
      "Submit an incorrect answer before requesting learn more.",
      409,
    );
  }

  const choices = parseChoices(current.choicesJson);
  const objectiveStatement =
    lesson.objectives.find((o) => o.id === current.objectiveId)?.statement ??
    null;

  try {
    const learnMore = await generateQuizLearnMore({
      prompt: current.prompt,
      choices: [...choices],
      correctChoiceText: choices[current.correctIndex] ?? "",
      objectiveStatement,
      extractedText: lesson.pdfAsset?.extractedText ?? "",
    });
    const last = incorrect.at(-1);
    if (last) {
      try {
        await quizRepository.markLearnMoreRequested(last.id);
      } catch (persistError) {
        throw new PlanDomainError(
          "PERSIST_FAILED",
          persistError instanceof Error
            ? persistError.message
            : "Failed to persist learn-more flag.",
          500,
        );
      }
    }
    return {
      ok: true as const,
      lessonId,
      questionId: current.id,
      topicSummary: learnMore.topicSummary,
      keyIdeas: learnMore.keyIdeas ?? [],
      guideBack: LEARN_MORE_GUIDE_BACK,
    };
  } catch (error) {
    if (error instanceof PlanDomainError) {
      throw error;
    }
    throw new PlanDomainError(
      "LLM_FAILED",
      error instanceof Error ? error.message : "Learn more generation failed.",
      502,
    );
  }
}
