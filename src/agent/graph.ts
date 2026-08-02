import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  isInterrupted,
} from "@langchain/langgraph";
import {
  demoLessonPlan,
  demoMCQs,
  generateLessonPlan,
  generateLessonSummary,
  generateMCQsForObjective,
} from "@/lib/llm";
import type {
  LessonPlan,
  LessonSummary,
  MCQQuestion,
  PublicMCQ,
  QuizAttempt,
} from "@/lib/types";

const LessonState = Annotation.Root({
  sessionId: Annotation<string>,
  fileName: Annotation<string>,
  pdfText: Annotation<string>,
  plan: Annotation<LessonPlan | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  planApproved: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  objectiveIndex: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  questionIndex: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  currentQuestions: Annotation<MCQQuestion[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  attempts: Annotation<QuizAttempt[]>({
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  summary: Annotation<LessonSummary | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  statusMessage: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

export type LessonGraphState = typeof LessonState.State;

function toPublicMCQ(q: MCQQuestion): PublicMCQ {
  return {
    id: q.id,
    objectiveId: q.objectiveId,
    question: q.question,
    choices: q.choices,
    hint: q.hint,
  };
}

async function planNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  try {
    const plan = await generateLessonPlan(state.pdfText);
    return {
      plan,
      statusMessage: "Lesson plan ready for your review.",
    };
  } catch (err) {
    console.warn("Plan generation fallback:", err);
    return {
      plan: demoLessonPlan(state.fileName || "document.pdf"),
      statusMessage:
        "Using a demo lesson plan (LLM unavailable). You can still walk through the full flow.",
    };
  }
}

async function awaitPlanApprovalNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  if (!state.plan) {
    throw new Error("Plan missing before approval interrupt");
  }

  let plan = state.plan;
  for (;;) {
    const decision = interrupt({
      type: "plan_approval",
      plan,
    }) as { approved?: boolean; plan?: LessonPlan };

    if (decision?.plan) {
      plan = decision.plan;
    }
    if (decision?.approved) {
      return {
        plan,
        planApproved: true,
        objectiveIndex: 0,
        questionIndex: 0,
        statusMessage: "Plan approved. Generating quiz questions…",
      };
    }
  }
}

async function prepareQuestionsNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  const plan = state.plan!;
  const objective = plan.objectives[state.objectiveIndex];
  if (!objective) {
    return { currentQuestions: [] };
  }

  try {
    const questions = await generateMCQsForObjective(state.pdfText, objective);
    return {
      currentQuestions: questions,
      questionIndex: 0,
      statusMessage: `Quiz ready for objective: ${objective.title}`,
    };
  } catch (err) {
    console.warn("MCQ generation fallback:", err);
    return {
      currentQuestions: demoMCQs(objective),
      questionIndex: 0,
      statusMessage: `Demo questions ready for: ${objective.title}`,
    };
  }
}

async function awaitAnswerNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  const plan = state.plan!;
  const question = state.currentQuestions[state.questionIndex];
  if (!question) {
    return {};
  }

  const objective = plan.objectives[state.objectiveIndex];
  const progress = {
    objectiveIndex: state.objectiveIndex,
    objectiveTotal: plan.objectives.length,
    questionIndex: state.questionIndex,
    questionTotal: state.currentQuestions.length,
    objectiveTitle: objective.title,
  };

  let attemptCount = 0;
  let selected = "";
  let isCorrect = false;
  let workingAttempts = [...state.attempts];

  // Present question, then retry with hints until correct (no score penalty beyond attempts)
  while (!isCorrect) {
    const payload = interrupt({
      type: attemptCount === 0 ? "mcq" : "mcq_feedback",
      correct: attemptCount === 0 ? undefined : false,
      hint: attemptCount === 0 ? undefined : question.hint,
      explanation: null,
      selectedChoiceId: attemptCount === 0 ? undefined : selected,
      question: toPublicMCQ(question),
      progress,
    }) as { selectedChoiceId: string };

    selected = payload.selectedChoiceId;
    isCorrect = selected === question.correctChoiceId;
    attemptCount += 1;
    workingAttempts = [
      ...workingAttempts.filter((a) => a.questionId !== question.id),
      {
        questionId: question.id,
        objectiveId: question.objectiveId,
        selectedChoiceId: selected,
        correct: isCorrect,
        attempts: attemptCount,
      },
    ];
  }

  // Correct — show explanation; resume continues the lesson
  interrupt({
    type: "mcq_feedback",
    correct: true,
    hint: question.hint,
    explanation: question.explanation,
    selectedChoiceId: selected,
    question: toPublicMCQ(question),
    progress,
  });

  return {
    attempts: workingAttempts,
    questionIndex: state.questionIndex + 1,
    statusMessage: "Nice work — moving on.",
  };
}

function routeAfterAnswer(state: LessonGraphState): string {
  if (state.questionIndex < state.currentQuestions.length) {
    return "await_answer";
  }
  if (state.objectiveIndex + 1 < (state.plan?.objectives.length || 0)) {
    return "next_objective";
  }
  return "summarize";
}

async function nextObjectiveNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  return {
    objectiveIndex: state.objectiveIndex + 1,
    questionIndex: 0,
    currentQuestions: [],
    statusMessage: "Loading next learning objective…",
  };
}

async function summarizeNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  try {
    const summary = await generateLessonSummary({
      plan: state.plan!,
      attempts: state.attempts,
    });
    return {
      summary,
      statusMessage: "Lesson complete.",
    };
  } catch (err) {
    console.warn("Summary fallback:", err);
    const total = state.attempts.length;
    const correct = state.attempts.filter((a) => a.correct).length;
    return {
      summary: {
        scorePercent: total ? Math.round((correct / total) * 100) : 0,
        totalQuestions: total,
        correctFirstTry: state.attempts.filter(
          (a) => a.correct && a.attempts === 1
        ).length,
        weakObjectives: [],
        strongObjectives: state.plan?.objectives.map((o) => o.title) || [],
        studyTips: [
          "Revisit sections you answered slowly.",
          "Explain each objective aloud in your own words.",
          "Skim the PDF once more focusing on definitions.",
        ],
        narrative:
          "You finished the lesson. Review the tips below and retry weak spots when ready.",
      },
      statusMessage: "Lesson complete (demo summary).",
    };
  }
}

async function presentSummaryNode(
  state: LessonGraphState
): Promise<Partial<LessonGraphState>> {
  interrupt({
    type: "summary",
    summary: state.summary,
  });
  return { statusMessage: "Session finished." };
}

const checkpointer = new MemorySaver();

function buildGraph() {
  const graph = new StateGraph(LessonState)
    .addNode("draft_plan", planNode)
    .addNode("await_plan_approval", awaitPlanApprovalNode)
    .addNode("prepare_questions", prepareQuestionsNode)
    .addNode("await_answer", awaitAnswerNode)
    .addNode("next_objective", nextObjectiveNode)
    .addNode("summarize", summarizeNode)
    .addNode("present_summary", presentSummaryNode)
    .addEdge(START, "draft_plan")
    .addEdge("draft_plan", "await_plan_approval")
    .addEdge("await_plan_approval", "prepare_questions")
    .addEdge("prepare_questions", "await_answer")
    .addConditionalEdges("await_answer", routeAfterAnswer, {
      await_answer: "await_answer",
      next_objective: "next_objective",
      summarize: "summarize",
    })
    .addEdge("next_objective", "prepare_questions")
    .addEdge("summarize", "present_summary")
    .addEdge("present_summary", END);

  return graph.compile({ checkpointer });
}

const globalForGraph = globalThis as unknown as {
  __pdfTutorGraph?: ReturnType<typeof buildGraph>;
};

export const lessonGraph =
  globalForGraph.__pdfTutorGraph ?? buildGraph();

if (!globalForGraph.__pdfTutorGraph) {
  globalForGraph.__pdfTutorGraph = lessonGraph;
}

export function getInterruptValue(result: unknown): unknown | null {
  if (isInterrupted(result)) {
    const interrupts = (result as { __interrupt__?: Array<{ value: unknown }> })
      .__interrupt__;
    return interrupts?.[0]?.value ?? null;
  }
  // invoke may return state with interrupts in different shapes
  if (
    result &&
    typeof result === "object" &&
    "__interrupt__" in (result as object)
  ) {
    const interrupts = (
      result as { __interrupt__: Array<{ value: unknown }> }
    ).__interrupt__;
    return interrupts?.[0]?.value ?? null;
  }
  return null;
}

export { Command };
