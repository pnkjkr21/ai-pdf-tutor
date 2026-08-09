import {
  Prisma,
  type Difficulty,
  type LearningObjective,
  type Lesson,
  type LessonPlan,
  type LessonProgress,
  type LessonStatus,
  type PdfAsset,
  type Question,
} from "@prisma/client";

import { prisma } from "@/db/prisma";

export type LessonWithPlan = Lesson & {
  pdfAsset: PdfAsset | null;
  plan: LessonPlan | null;
  objectives: LearningObjective[];
  progress: LessonProgress | null;
  questions: Question[];
  _count: { questions: number };
};

/** Row shape for the lesson library side panel — no PDF text, no answer keys. */
export type LessonSummaryRow = Lesson & {
  pdfAsset: Pick<PdfAsset, "originalName" | "pageCount" | "byteSize"> | null;
  progress: Pick<
    LessonProgress,
    "questionsCompleted" | "objectivesCompleted" | "completedAt"
  > | null;
  _count: { questions: number; objectives: number };
};

export type PendingPlanPayload = {
  title: string;
  difficulty: Difficulty;
  summary: string | null;
  rawPlanJson: Prisma.InputJsonValue;
  objectives: string[];
};

/** Shared by every query that returns a LessonSummaryRow. */
const LESSON_SUMMARY_INCLUDE = {
  pdfAsset: {
    select: { originalName: true, pageCount: true, byteSize: true },
  },
  progress: {
    select: {
      questionsCompleted: true,
      objectivesCompleted: true,
      completedAt: true,
    },
  },
  _count: { select: { questions: true, objectives: true } },
} satisfies Prisma.LessonInclude;

export const lessonRepository = {
  async createUploaded(): Promise<Lesson> {
    return prisma.lesson.create({
      data: { status: "UPLOADED" },
    });
  },

  async createPdfAsset(data: {
    lessonId: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
    storagePath: string;
    sha256?: string | null;
    pageCount?: number | null;
    extractedText?: string | null;
  }): Promise<PdfAsset> {
    return prisma.pdfAsset.create({
      data: {
        lessonId: data.lessonId,
        originalName: data.originalName,
        mimeType: data.mimeType,
        byteSize: data.byteSize,
        storagePath: data.storagePath,
        sha256: data.sha256 ?? null,
        pageCount: data.pageCount ?? null,
        extractedText: data.extractedText ?? null,
      },
    });
  },

  async updatePdfAsset(
    lessonId: string,
    data: Prisma.PdfAssetUpdateInput,
  ): Promise<PdfAsset> {
    return prisma.pdfAsset.update({
      where: { lessonId },
      data,
    });
  },

  async markStatus(
    lessonId: string,
    status: LessonStatus,
    errorMessage: string | null = null,
    extra: Prisma.LessonUpdateInput = {},
  ): Promise<Lesson> {
    return prisma.lesson.update({
      where: { id: lessonId },
      data: {
        status,
        errorMessage,
        ...extra,
      },
    });
  },

  async findById(lessonId: string): Promise<LessonWithPlan | null> {
    return prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        pdfAsset: true,
        plan: true,
        objectives: { orderBy: { orderIndex: "asc" } },
        progress: true,
        questions: { orderBy: { orderIndex: "asc" } },
        _count: { select: { questions: true } },
      },
    });
  },

  /**
   * Lesson library for the side panel: most recently touched first.
   * Deliberately excludes `extractedText` and every Question column.
   */
  async listSummaries(limit = 50): Promise<LessonSummaryRow[]> {
    return prisma.lesson.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: LESSON_SUMMARY_INCLUDE,
    });
  },

  /**
   * Most recently touched lesson built from byte-identical PDF bytes, or null.
   * Queried from Lesson (pdfAsset.lessonId is unique, so it is 1:1) so the row
   * comes back already shaped as a LessonSummaryRow.
   *
   * No owner scoping — single-user MVP. In any multi-tenant future this MUST be
   * scoped by owner, or upload becomes a hash oracle for other users' documents.
   */
  async findDuplicateByPdfHash(
    sha256: string,
    statuses: readonly LessonStatus[],
  ): Promise<LessonSummaryRow | null> {
    return prisma.lesson.findFirst({
      where: {
        pdfAsset: { sha256 },
        status: { in: [...statuses] },
      },
      // Matches listSummaries, so the lesson we name is the sidebar's top row.
      orderBy: { updatedAt: "desc" },
      include: LESSON_SUMMARY_INCLUDE,
    });
  },

  /**
   * Existence check for deletion. Deliberately not findById — that pulls the
   * full extractedText and every Question row just to confirm the lesson exists.
   */
  async findDeletionTarget(
    lessonId: string,
  ): Promise<{ id: string; pdfAsset: { storagePath: string } | null } | null> {
    return prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        pdfAsset: { select: { storagePath: true } },
      },
    });
  },

  /** Child rows (PdfAsset, plan, objectives, questions, attempts, progress) cascade. */
  async deleteById(lessonId: string): Promise<void> {
    await prisma.lesson.delete({ where: { id: lessonId } });
  },

  /**
   * Persist MCQs + LessonProgress and move to QUIZ_READY in one transaction.
   * Never called unless domain validated LLM output (including secrets).
   */
  async createQuizReady(params: {
    lessonId: string;
    questions: Array<{
      objectiveId: string;
      orderIndex: number;
      prompt: string;
      choices: [string, string, string, string];
      correctIndex: number;
      explanation: string;
    }>;
  }): Promise<LessonWithPlan> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.question.count({
        where: { lessonId: params.lessonId },
      });
      if (existing > 0) {
        throw new Error("Questions already exist for this lesson");
      }

      await tx.question.createMany({
        data: params.questions.map((q) => ({
          lessonId: params.lessonId,
          objectiveId: q.objectiveId,
          orderIndex: q.orderIndex,
          prompt: q.prompt,
          choicesJson: q.choices,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
      });

      await tx.lessonProgress.upsert({
        where: { lessonId: params.lessonId },
        create: {
          lessonId: params.lessonId,
          currentObjectiveIndex: 0,
          currentQuestionIndex: 0,
          questionsCompleted: 0,
          objectivesCompleted: 0,
          firstAttemptCorrect: 0,
          totalAttempts: 0,
          retryCount: 0,
        },
        update: {
          currentObjectiveIndex: 0,
          currentQuestionIndex: 0,
          questionsCompleted: 0,
          objectivesCompleted: 0,
          firstAttemptCorrect: 0,
          totalAttempts: 0,
          retryCount: 0,
          completedAt: null,
          reportJson: Prisma.DbNull,
        },
      });

      await tx.lesson.update({
        where: { id: params.lessonId },
        data: {
          status: "QUIZ_READY",
          errorMessage: null,
        },
      });
    });

    const lesson = await this.findById(params.lessonId);
    if (!lesson) {
      throw new Error("Lesson missing after quiz persist");
    }
    return lesson;
  },

  /**
   * Replace plan + objectives atomically. Does not create Question rows.
   */
  async replacePendingPlan(
    lessonId: string,
    payload: PendingPlanPayload,
  ): Promise<LessonWithPlan> {
    await prisma.$transaction(async (tx) => {
      await tx.learningObjective.deleteMany({ where: { lessonId } });
      await tx.lessonPlan.deleteMany({ where: { lessonId } });

      await tx.lessonPlan.create({
        data: {
          lessonId,
          title: payload.title,
          difficulty: payload.difficulty,
          summary: payload.summary,
          rawPlanJson: payload.rawPlanJson,
          approvedAt: null,
        },
      });

      await tx.learningObjective.createMany({
        data: payload.objectives.map((statement, orderIndex) => ({
          lessonId,
          orderIndex,
          statement,
        })),
      });

      await tx.lesson.update({
        where: { id: lessonId },
        data: {
          status: "PLAN_PENDING_APPROVAL",
          title: payload.title,
          difficulty: payload.difficulty,
          errorMessage: null,
        },
      });
    });

    const lesson = await this.findById(lessonId);
    if (!lesson) {
      throw new Error("Lesson missing after plan persist");
    }
    return lesson;
  },

  async updatePendingPlanEdits(
    lessonId: string,
    payload: {
      title: string;
      difficulty: Difficulty;
      summary: string | null;
      objectives: string[];
    },
  ): Promise<LessonWithPlan> {
    await prisma.$transaction(async (tx) => {
      await tx.learningObjective.deleteMany({ where: { lessonId } });

      await tx.lessonPlan.update({
        where: { lessonId },
        data: {
          title: payload.title,
          difficulty: payload.difficulty,
          summary: payload.summary,
          approvedAt: null,
        },
      });

      await tx.learningObjective.createMany({
        data: payload.objectives.map((statement, orderIndex) => ({
          lessonId,
          orderIndex,
          statement,
        })),
      });

      await tx.lesson.update({
        where: { id: lessonId },
        data: {
          title: payload.title,
          difficulty: payload.difficulty,
          status: "PLAN_PENDING_APPROVAL",
        },
      });
    });

    const lesson = await this.findById(lessonId);
    if (!lesson) {
      throw new Error("Lesson missing after plan edit");
    }
    return lesson;
  },

  async approvePlan(lessonId: string): Promise<LessonWithPlan> {
    await prisma.$transaction(async (tx) => {
      await tx.lessonPlan.update({
        where: { lessonId },
        data: { approvedAt: new Date() },
      });
      await tx.lesson.update({
        where: { id: lessonId },
        data: {
          status: "PLAN_APPROVED",
          errorMessage: null,
        },
      });
    });

    const lesson = await this.findById(lessonId);
    if (!lesson) {
      throw new Error("Lesson missing after approve");
    }
    return lesson;
  },
};
