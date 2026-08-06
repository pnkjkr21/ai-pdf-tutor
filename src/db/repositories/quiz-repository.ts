import type { Attempt, Question } from "@prisma/client";

import { prisma } from "@/db/prisma";
import type { LessonWithPlan } from "@/db/repositories/lesson-repository";
import { lessonRepository } from "@/db/repositories/lesson-repository";

export type LessonQuizState = LessonWithPlan & {
  attempts: Attempt[];
};

export const quizRepository = {
  async findQuizState(lessonId: string): Promise<LessonQuizState | null> {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        pdfAsset: true,
        plan: true,
        objectives: { orderBy: { orderIndex: "asc" } },
        progress: true,
        questions: { orderBy: { orderIndex: "asc" } },
        attempts: { orderBy: { createdAt: "asc" } },
        _count: { select: { questions: true } },
      },
    });
    return lesson;
  },

  async recordAttemptAndProgress(params: {
    lessonId: string;
    question: Question;
    selectedIndex: number;
    isCorrect: boolean;
    isFirstAttempt: boolean;
    hintRequested?: boolean;
    progressPatch: {
      totalAttempts: number;
      retryCount: number;
      firstAttemptCorrect: number;
      questionsCompleted: number;
      objectivesCompleted: number;
      currentObjectiveIndex: number;
      currentQuestionIndex: number;
      markObjectiveIdCompleted?: string | null;
      startInProgress: boolean;
    };
  }): Promise<LessonQuizState> {
    await prisma.$transaction(async (tx) => {
      await tx.attempt.create({
        data: {
          lessonId: params.lessonId,
          questionId: params.question.id,
          selectedIndex: params.selectedIndex,
          outcome: params.isCorrect ? "CORRECT" : "INCORRECT",
          isFirstAttempt: params.isFirstAttempt,
          hintRequested: params.hintRequested ?? false,
        },
      });

      if (params.progressPatch.markObjectiveIdCompleted) {
        await tx.learningObjective.update({
          where: { id: params.progressPatch.markObjectiveIdCompleted },
          data: { completedAt: new Date() },
        });
      }

      await tx.lessonProgress.update({
        where: { lessonId: params.lessonId },
        data: {
          totalAttempts: params.progressPatch.totalAttempts,
          retryCount: params.progressPatch.retryCount,
          firstAttemptCorrect: params.progressPatch.firstAttemptCorrect,
          questionsCompleted: params.progressPatch.questionsCompleted,
          objectivesCompleted: params.progressPatch.objectivesCompleted,
          currentObjectiveIndex: params.progressPatch.currentObjectiveIndex,
          currentQuestionIndex: params.progressPatch.currentQuestionIndex,
        },
      });

      if (params.progressPatch.startInProgress) {
        await tx.lesson.update({
          where: { id: params.lessonId },
          data: { status: "IN_PROGRESS", errorMessage: null },
        });
      }
    });

    const state = await this.findQuizState(params.lessonId);
    if (!state) {
      throw new Error("Lesson missing after attempt");
    }
    return state;
  },

  async markHintRequested(attemptId: string): Promise<void> {
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { hintRequested: true },
    });
  },

  async markLearnMoreRequested(attemptId: string): Promise<void> {
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { learnMoreRequested: true },
    });
  },

  async advanceAfterCorrect(params: {
    lessonId: string;
    nextQuestionIndex: number;
    nextObjectiveIndex: number;
    finished: boolean;
  }): Promise<LessonQuizState> {
    await prisma.$transaction(async (tx) => {
      await tx.lessonProgress.update({
        where: { lessonId: params.lessonId },
        data: {
          currentQuestionIndex: params.nextQuestionIndex,
          currentObjectiveIndex: params.nextObjectiveIndex,
          ...(params.finished
            ? { completedAt: new Date() }
            : {}),
        },
      });

      if (params.finished) {
        await tx.lesson.update({
          where: { id: params.lessonId },
          data: { status: "COMPLETED", errorMessage: null },
        });
      }
    });

    const state = await this.findQuizState(params.lessonId);
    if (!state) {
      throw new Error("Lesson missing after advance");
    }
    return state;
  },

  async reloadAsLessonWithPlan(lessonId: string): Promise<LessonWithPlan> {
    const lesson = await lessonRepository.findById(lessonId);
    if (!lesson) {
      throw new Error("Lesson not found");
    }
    return lesson;
  },

  /** Persist completion report only — does not change lesson status or attempts. */
  async saveCompletionReport(params: {
    lessonId: string;
    reportJson: object;
  }): Promise<void> {
    await prisma.lessonProgress.update({
      where: { lessonId: params.lessonId },
      data: { reportJson: params.reportJson },
    });
  },
};
