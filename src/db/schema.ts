import { relations, sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { LessonSummary } from "@/lib/types";

/**
 * Lesson — top-level interactive lesson created from a PDF.
 */
export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  difficulty: text("difficulty", {
    enum: ["beginner", "intermediate", "advanced"],
  }).notNull(),
  summary: text("summary").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  pdfText: text("pdf_text").notNull().default(""),
  threadId: text("thread_id"),
  status: text("status", {
    enum: ["draft", "plan", "quiz", "summary"],
  })
    .notNull()
    .default("draft"),
  statusMessage: text("status_message").notNull().default(""),
  summaryJson: text("summary_json", { mode: "json" }).$type<LessonSummary | null>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Objective — ordered learning goals within a lesson.
 */
export const objectives = sqliteTable("objectives", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  difficulty: text("difficulty", {
    enum: ["beginner", "intermediate", "advanced"],
  })
    .notNull()
    .default("beginner"),
  order: integer("order").notNull(),
});

/**
 * Quiz — MCQ for an objective.
 * `options` is JSON: [{ id: "A"|"B"|"C"|"D", text: string }, ...]
 */
export const quizzes = sqliteTable("quizzes", {
  id: text("id").primaryKey(),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  options: text("options", { mode: "json" })
    .$type<Array<{ id: string; text: string }>>()
    .notNull(),
  correctAnswer: text("correct_answer").notNull(),
  hint: text("hint").notNull(),
  explanation: text("explanation").notNull(),
});

/**
 * StudentProgress — progress through a lesson.
 */
export const studentProgress = sqliteTable("student_progress", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  currentObjective: text("current_objective"),
  score: integer("score").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

/**
 * Attempt — one answer try for a quiz question.
 */
export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  selectedOption: text("selected_option").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const lessonsRelations = relations(lessons, ({ many }) => ({
  objectives: many(objectives),
  progress: many(studentProgress),
}));

export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  lesson: one(lessons, {
    fields: [objectives.lessonId],
    references: [lessons.id],
  }),
  quizzes: many(quizzes),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  objective: one(objectives, {
    fields: [quizzes.objectiveId],
    references: [objectives.id],
  }),
  attempts: many(attempts),
}));

export const studentProgressRelations = relations(studentProgress, ({ one }) => ({
  lesson: one(lessons, {
    fields: [studentProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [attempts.quizId],
    references: [quizzes.id],
  }),
}));

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Objective = typeof objectives.$inferSelect;
export type NewObjective = typeof objectives.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type StudentProgress = typeof studentProgress.$inferSelect;
export type NewStudentProgress = typeof studentProgress.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
