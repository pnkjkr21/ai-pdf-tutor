import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type {
  Difficulty,
  LearningObjective,
  LessonPlan,
  LessonSummary,
  MCQQuestion,
  QuizAttempt,
} from "@/lib/types";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

function requireApiKey() {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error(
      "DEEPSEEK_API_KEY is missing. Add it to .env.local (see .env.example)."
    );
  }
}

function model(temperature = 0.3) {
  requireApiKey();
  return new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    apiKey: process.env.DEEPSEEK_API_KEY,
    temperature,
    configuration: {
      baseURL: DEEPSEEK_BASE_URL,
    },
    // DeepSeek V4 enables thinking by default; disable for faster structured JSON
    modelKwargs: {
      thinking: { type: "disabled" },
    },
  });
}

/**
 * DeepSeek rejects OpenAI-style response_format (json_schema / sometimes json_object
 * via LangChain helpers). Ask for JSON in the prompt and validate with Zod instead.
 */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}

async function invokeJson<T>(
  schema: z.ZodType<T>,
  messages: Array<{ role: string; content: string }>,
  temperature = 0.3
): Promise<T> {
  const response = await model(temperature).invoke(messages);
  const raw = messageText(response.content);
  return schema.parse(extractJsonObject(raw));
}

const planSchema = z.object({
  title: z.string(),
  summary: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  objectives: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      })
    )
    .min(2)
    .max(6),
});

const mcqSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        choices: z
          .array(
            z.object({
              id: z.enum(["A", "B", "C", "D"]),
              text: z.string(),
            })
          )
          .length(4),
        correctChoiceId: z.enum(["A", "B", "C", "D"]),
        explanation: z.string(),
        hint: z.string(),
      })
    )
    .min(1)
    .max(3),
});

const summarySchema = z.object({
  studyTips: z.array(z.string()).min(3).max(6),
  narrative: z.string(),
});

export async function generateLessonPlan(pdfText: string): Promise<LessonPlan> {
  const plan = await invokeJson(
    planSchema,
    [
      {
        role: "system",
        content: `You are an expert instructional designer.
Create a concise interactive lesson plan from the provided PDF content.
Rules:
- 3 to 5 learning objectives
- Objectives must be grounded ONLY in the PDF
- Keep titles short and actionable
- Assign overall difficulty and per-objective difficulty
- Use objective ids like obj-1, obj-2, ...
- Respond with a single valid JSON object only (no markdown), shaped as:
  {"title":string,"summary":string,"difficulty":"beginner"|"intermediate"|"advanced","objectives":[{"id":string,"title":string,"description":string,"difficulty":"beginner"|"intermediate"|"advanced"}]}`,
      },
      {
        role: "user",
        content: `PDF content:\n\n${pdfText.slice(0, 24000)}`,
      },
    ],
    0.4
  );

  return plan;
}

export async function generateMCQsForObjective(
  pdfText: string,
  objective: LearningObjective
): Promise<MCQQuestion[]> {
  const result = await invokeJson(
    mcqSchema,
    [
      {
        role: "system",
        content: `You create multiple-choice quiz questions for one learning objective.
Rules:
- Generate 2 questions
- Exactly 4 choices A–D
- Only one correct answer
- Ground every question in the PDF excerpt
- hint must nudge without revealing the answer
- explanation is shown only after a correct answer
- Use question ids like q-1, q-2
- Respond with a single valid JSON object only (no markdown), shaped as:
  {"questions":[{"id":string,"question":string,"choices":[{"id":"A"|"B"|"C"|"D","text":string}],"correctChoiceId":"A"|"B"|"C"|"D","explanation":string,"hint":string}]}`,
      },
      {
        role: "user",
        content: `Objective:
Title: ${objective.title}
Description: ${objective.description}
Difficulty: ${objective.difficulty}

PDF content:
${pdfText.slice(0, 20000)}`,
      },
    ],
    0.5
  );

  return result.questions.map((q) => ({
    ...q,
    objectiveId: objective.id,
  }));
}

export async function generateLessonSummary(input: {
  plan: LessonPlan;
  attempts: QuizAttempt[];
}): Promise<LessonSummary> {
  const total = input.attempts.length;
  const correct = input.attempts.filter((a) => a.correct).length;
  const correctFirstTry = input.attempts.filter(
    (a) => a.correct && a.attempts === 1
  ).length;
  const scorePercent = total === 0 ? 0 : Math.round((correct / total) * 100);

  const byObjective = new Map<string, { correct: number; total: number }>();
  for (const a of input.attempts) {
    const cur = byObjective.get(a.objectiveId) || { correct: 0, total: 0 };
    cur.total += 1;
    if (a.correct) cur.correct += 1;
    byObjective.set(a.objectiveId, cur);
  }

  const weakObjectives: string[] = [];
  const strongObjectives: string[] = [];
  for (const obj of input.plan.objectives) {
    const stats = byObjective.get(obj.id);
    if (!stats) continue;
    const ratio = stats.correct / stats.total;
    if (ratio < 0.7) weakObjectives.push(obj.title);
    else strongObjectives.push(obj.title);
  }

  const generated = await invokeJson(
    summarySchema,
    [
      {
        role: "system",
        content: `You are a supportive tutor writing a short progress report.
Give personalized study tips. Be encouraging and specific.
Do not invent content that was not in the lesson.
Respond with a single valid JSON object only (no markdown):
  {"studyTips":[string,string,string],"narrative":string}`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            lessonTitle: input.plan.title,
            difficulty: input.plan.difficulty,
            scorePercent,
            correctFirstTry,
            totalQuestions: total,
            weakObjectives,
            strongObjectives,
            objectives: input.plan.objectives.map((o) => o.title),
          },
          null,
          2
        ),
      },
    ],
    0.5
  );

  return {
    scorePercent,
    totalQuestions: total,
    correctFirstTry,
    weakObjectives,
    strongObjectives,
    studyTips: generated.studyTips,
    narrative: generated.narrative,
  };
}

/** Fallback when DeepSeek is unavailable — keeps demos runnable */
export function demoLessonPlan(fileName: string): LessonPlan {
  const difficulty: Difficulty = "beginner";
  return {
    title: `Lesson from ${fileName}`,
    summary:
      "A demo lesson plan (DEEPSEEK_API_KEY missing or generation failed). Approve to continue with sample questions.",
    difficulty,
    objectives: [
      {
        id: "obj-1",
        title: "Core concepts",
        description: "Identify the main ideas introduced in the document.",
        difficulty,
      },
      {
        id: "obj-2",
        title: "Key details",
        description: "Recall important supporting details from the text.",
        difficulty,
      },
      {
        id: "obj-3",
        title: "Application",
        description: "Apply the ideas to a short practical scenario.",
        difficulty: "intermediate",
      },
    ],
  };
}

export function demoMCQs(objective: LearningObjective): MCQQuestion[] {
  return [
    {
      id: `${objective.id}-q1`,
      objectiveId: objective.id,
      question: `Which statement best matches the objective "${objective.title}"?`,
      choices: [
        { id: "A", text: "It is unrelated to the PDF content." },
        { id: "B", text: objective.description },
        { id: "C", text: "It only covers unrelated trivia." },
        { id: "D", text: "It cannot be learned from documents." },
      ],
      correctChoiceId: "B",
      explanation: `This objective focuses on: ${objective.description}`,
      hint: "Re-read the objective description carefully — one choice mirrors it almost exactly.",
    },
    {
      id: `${objective.id}-q2`,
      objectiveId: objective.id,
      question: `What difficulty was assigned to "${objective.title}"?`,
      choices: [
        { id: "A", text: "beginner" },
        { id: "B", text: "intermediate" },
        { id: "C", text: "advanced" },
        { id: "D", text: "expert" },
      ],
      correctChoiceId:
        objective.difficulty === "beginner"
          ? "A"
          : objective.difficulty === "intermediate"
            ? "B"
            : "C",
      explanation: `This objective is labeled ${objective.difficulty}.`,
      hint: "Check the difficulty badge on the learning plan for this objective.",
    },
  ];
}
