export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface LearningObjective {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
}

export interface LessonPlan {
  title: string;
  summary: string;
  difficulty: Difficulty;
  objectives: LearningObjective[];
}

export interface MCQChoice {
  id: string; // A | B | C | D
  text: string;
}

export interface MCQQuestion {
  id: string;
  objectiveId: string;
  question: string;
  choices: MCQChoice[];
  correctChoiceId: string;
  explanation: string;
  hint: string;
}

export interface QuizAttempt {
  questionId: string;
  objectiveId: string;
  selectedChoiceId: string;
  correct: boolean;
  attempts: number;
}

export interface LessonSummary {
  scorePercent: number;
  totalQuestions: number;
  correctFirstTry: number;
  weakObjectives: string[];
  strongObjectives: string[];
  studyTips: string[];
  narrative: string;
}

export type InterruptPayload =
  | { type: "plan_approval"; plan: LessonPlan }
  | {
      type: "mcq";
      question: Omit<MCQQuestion, "correctChoiceId" | "explanation"> & {
        // correct answer intentionally omitted from client interrupt payload view
        // but server still holds full question in state
      };
      progress: {
        objectiveIndex: number;
        objectiveTotal: number;
        questionIndex: number;
        questionTotal: number;
        objectiveTitle: string;
      };
    }
  | { type: "summary"; summary: LessonSummary };

/** Safe MCQ for the UI — never includes the correct answer */
export interface PublicMCQ {
  id: string;
  objectiveId: string;
  question: string;
  choices: MCQChoice[];
  hint: string;
}

export interface SessionRecord {
  id: string;
  fileName: string;
  pdfText: string;
  createdAt: string;
}
