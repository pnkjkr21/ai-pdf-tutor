import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db";
import {
  attempts,
  lessons,
  objectives,
  quizzes,
  studentProgress,
} from "@/db/schema";
import type {
  Difficulty,
  LessonPlan,
  LessonSummary,
  MCQQuestion,
  QuizAttempt,
} from "@/lib/types";

export type LessonStatus = "draft" | "plan" | "quiz" | "summary";

/** Create a draft lesson when a PDF is uploaded (persists pdf text). */
export function createDraftLesson(input: {
  id: string;
  fileName: string;
  pdfText: string;
}) {
  db.insert(lessons)
    .values({
      id: input.id,
      title: input.fileName,
      difficulty: "beginner",
      summary: "",
      fileName: input.fileName,
      pdfText: input.pdfText,
      status: "draft",
      statusMessage: "PDF uploaded",
    })
    .onConflictDoUpdate({
      target: lessons.id,
      set: {
        fileName: input.fileName,
        pdfText: input.pdfText,
        title: input.fileName,
        status: "draft",
        statusMessage: "PDF uploaded",
      },
    })
    .run();
}

export function getLessonById(id: string) {
  return db.query.lessons.findFirst({
    where: eq(lessons.id, id),
  });
}

export function getLessonByThreadId(threadId: string) {
  return db.query.lessons.findFirst({
    where: eq(lessons.threadId, threadId),
  });
}

export function attachThread(lessonId: string, threadId: string) {
  db.update(lessons)
    .set({ threadId, statusMessage: "Lesson started" })
    .where(eq(lessons.id, lessonId))
    .run();
}

/**
 * Sync LangGraph state into relational tables so refresh / Studio show data.
 */
export function syncLessonFromGraphState(input: {
  lessonId: string;
  threadId: string;
  fileName?: string;
  plan: LessonPlan | null;
  planApproved: boolean;
  objectiveIndex: number;
  questionIndex: number;
  currentQuestions: MCQQuestion[];
  attempts: QuizAttempt[];
  summary: LessonSummary | null;
  statusMessage: string;
  interruptType?: string | null;
}) {
  const status: LessonStatus =
    input.interruptType === "summary" || input.summary
      ? "summary"
      : input.interruptType === "plan_approval"
        ? "plan"
        : input.planApproved
          ? "quiz"
          : input.plan
            ? "plan"
            : "draft";

  const title = input.plan?.title || input.fileName || "Untitled lesson";
  const difficulty = (input.plan?.difficulty || "beginner") as Difficulty;

  db.update(lessons)
    .set({
      title,
      difficulty,
      summary: input.plan?.summary || "",
      threadId: input.threadId,
      status,
      statusMessage: input.statusMessage,
      summaryJson: input.summary,
    })
    .where(eq(lessons.id, input.lessonId))
    .run();

  if (input.plan?.objectives?.length) {
    // Replace objectives for this lesson (cascades quizzes/attempts if we delete carefully)
    const existingObjectives = db
      .select()
      .from(objectives)
      .where(eq(objectives.lessonId, input.lessonId))
      .all();

    // Only insert objectives once (keep stable ids from plan)
    if (existingObjectives.length === 0) {
      db.insert(objectives)
        .values(
          input.plan.objectives.map((obj, index) => ({
            id: obj.id,
            lessonId: input.lessonId,
            title: obj.title,
            description: obj.description,
            difficulty: obj.difficulty,
            order: index + 1,
          }))
        )
        .run();
    }
  }

  // Upsert current batch of quizzes
  for (const q of input.currentQuestions) {
    const existing = db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, q.id))
      .get();
    if (existing) continue;
    db.insert(quizzes)
      .values({
        id: q.id,
        objectiveId: q.objectiveId,
        question: q.question,
        options: q.choices,
        correctAnswer: q.correctChoiceId,
        hint: q.hint,
        explanation: q.explanation,
      })
      .run();
  }

  // Progress row
  const currentObjective =
    input.plan?.objectives[input.objectiveIndex]?.id ?? null;
  const score = input.attempts.filter((a) => a.correct).length;
  const completed = status === "summary";

  const progress = db
    .select()
    .from(studentProgress)
    .where(eq(studentProgress.lessonId, input.lessonId))
    .get();

  if (!progress) {
    db.insert(studentProgress)
      .values({
        id: uuidv4(),
        lessonId: input.lessonId,
        currentObjective,
        score,
        completed,
        completedAt: completed ? new Date() : null,
      })
      .run();
  } else {
    db.update(studentProgress)
      .set({
        currentObjective,
        score,
        completed,
        completedAt: completed ? progress.completedAt || new Date() : null,
      })
      .where(eq(studentProgress.id, progress.id))
      .run();
  }

  // Sync attempts (one row per questionId — latest)
  for (const a of input.attempts) {
    const existing = db
      .select()
      .from(attempts)
      .where(eq(attempts.quizId, a.questionId))
      .all();

    // Keep a single latest attempt record per quiz for simplicity
    if (existing.length > 0) {
      db.update(attempts)
        .set({
          selectedOption: a.selectedChoiceId,
          correct: a.correct,
          retryCount: Math.max(0, a.attempts - 1),
        })
        .where(eq(attempts.id, existing[0].id))
        .run();
    } else {
      // Quiz row may not exist yet if user answered after restore from older batch — skip
      const quizExists = db
        .select()
        .from(quizzes)
        .where(eq(quizzes.id, a.questionId))
        .get();
      if (!quizExists) continue;
      db.insert(attempts)
        .values({
          id: uuidv4(),
          quizId: a.questionId,
          selectedOption: a.selectedChoiceId,
          correct: a.correct,
          retryCount: Math.max(0, a.attempts - 1),
        })
        .run();
    }
  }
}
