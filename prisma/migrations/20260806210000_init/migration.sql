-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('UPLOADED', 'PARSED', 'PLAN_PENDING_APPROVAL', 'PLAN_APPROVED', 'QUIZ_READY', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('CORRECT', 'INCORRECT');

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "status" "LessonStatus" NOT NULL DEFAULT 'UPLOADED',
    "difficulty" "Difficulty",
    "sourceTextHash" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfAsset" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "byteSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "pageCount" INTEGER,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "summary" TEXT,
    "rawPlanJson" JSONB,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choicesJson" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "isFirstAttempt" BOOLEAN NOT NULL,
    "hintRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "currentObjectiveIndex" INTEGER NOT NULL DEFAULT 0,
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "questionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "objectivesCompleted" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptCorrect" INTEGER NOT NULL DEFAULT 0,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "reportJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfAsset_lessonId_key" ON "PdfAsset"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPlan_lessonId_key" ON "LessonPlan"("lessonId");

-- CreateIndex
CREATE INDEX "LearningObjective_lessonId_idx" ON "LearningObjective"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjective_lessonId_orderIndex_key" ON "LearningObjective"("lessonId", "orderIndex");

-- CreateIndex
CREATE INDEX "Question_objectiveId_idx" ON "Question"("objectiveId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_lessonId_orderIndex_key" ON "Question"("lessonId", "orderIndex");

-- CreateIndex
CREATE INDEX "Attempt_lessonId_idx" ON "Attempt"("lessonId");

-- CreateIndex
CREATE INDEX "Attempt_questionId_idx" ON "Attempt"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_lessonId_key" ON "LessonProgress"("lessonId");

-- AddForeignKey
ALTER TABLE "PdfAsset" ADD CONSTRAINT "PdfAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "LearningObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

