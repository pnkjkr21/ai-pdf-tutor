import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  buildLessonPlanSystemPrompt,
  buildLessonPlanUserPrompt,
  truncatePdfTextForPlan,
} from "@/agents/prompts/lesson-plan";
import {
  lessonPlanLlmSchema,
  type LessonPlanLlmOutput,
} from "@/agents/schemas/lesson-plan";
import { mcqLlmSchema, type McqLlmOutput } from "@/agents/schemas/mcq";
import {
  buildMcqSystemPrompt,
  buildMcqUserPrompt,
  truncatePdfTextForQuiz,
} from "@/agents/prompts/mcq";
import {
  buildHintSystemPrompt,
  buildHintUserPrompt,
  truncatePdfTextForHint,
} from "@/agents/prompts/hint";
import { hintLlmSchema, type HintLlmOutput } from "@/agents/schemas/hint";
import {
  learnMoreLlmSchema,
  type LearnMoreLlmOutput,
} from "@/agents/schemas/learn-more";
import {
  buildLearnMoreSystemPrompt,
  buildLearnMoreUserPrompt,
  truncatePdfTextForLearnMore,
} from "@/agents/prompts/learn-more";
import { assertDoesNotContainCorrectChoice } from "@/agents/llm/anti-spoiler";
import {
  createDeepSeekChat,
  extractJsonObject,
  isNonRetryableLlmError,
  messageContentToString,
} from "@/agents/llm/shared";

async function withJsonRetry<T>(
  label: string,
  invoke: () => Promise<T>,
): Promise<T> {
  try {
    return await invoke();
  } catch (firstError) {
    if (isNonRetryableLlmError(firstError)) {
      throw new Error(
        firstError instanceof Error
          ? firstError.message
          : "DeepSeek authentication or authorization failed.",
      );
    }
    try {
      return await invoke();
    } catch (secondError) {
      const detail =
        secondError instanceof Error
          ? secondError.message
          : firstError instanceof Error
            ? firstError.message
            : "Unknown structured-output error";
      throw new Error(`${label} failed validation after retry: ${detail}`);
    }
  }
}

/**
 * Generate a Zod-validated lesson plan from PDF text via DeepSeek.
 */
export async function generateLessonPlanFromPdfText(
  extractedText: string,
): Promise<LessonPlanLlmOutput> {
  const { text, truncated, maxChars } = truncatePdfTextForPlan(extractedText);
  if (!text) {
    throw new Error("PDF extracted text is empty.");
  }

  const model = createDeepSeekChat(0.2);

  return withJsonRetry("DeepSeek lesson plan", async () => {
    const response = await model.invoke([
      new SystemMessage(buildLessonPlanSystemPrompt()),
      new HumanMessage(
        buildLessonPlanUserPrompt({ pdfText: text, truncated, maxChars }),
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return lessonPlanLlmSchema.parse(parsed);
  });
}

export type McqGenerationContext = {
  title: string;
  difficulty: string;
  objectives: Array<{ orderIndex: number; statement: string }>;
  extractedText: string;
};

/**
 * Generate Zod-validated MCQs from PDF text + approved objectives via DeepSeek.
 * No embeddings / vector DB — truncated extracted text only.
 */
export async function generateMcqsFromPdfText(
  context: McqGenerationContext,
): Promise<McqLlmOutput> {
  const { text, truncated, maxChars } = truncatePdfTextForQuiz(
    context.extractedText,
  );
  if (!text) {
    throw new Error("PDF extracted text is empty.");
  }

  const model = createDeepSeekChat(0.3);

  return withJsonRetry("DeepSeek MCQ generation", async () => {
    const response = await model.invoke([
      new SystemMessage(buildMcqSystemPrompt()),
      new HumanMessage(
        buildMcqUserPrompt({
          title: context.title,
          difficulty: context.difficulty,
          objectives: context.objectives,
          pdfText: text,
          truncated,
          maxChars,
        }),
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return mcqLlmSchema.parse(parsed);
  });
}

export type HintGenerationContext = {
  prompt: string;
  choices: string[];
  correctChoiceText: string;
  extractedText: string;
};

/**
 * Generate a Zod-validated hint that must not reveal the correct answer.
 */
export async function generateQuizHint(
  context: HintGenerationContext,
): Promise<HintLlmOutput> {
  const { text, truncated, maxChars } = truncatePdfTextForHint(
    context.extractedText,
  );
  if (!text) {
    throw new Error("PDF extracted text is empty.");
  }

  const model = createDeepSeekChat(0.4);

  const output = await withJsonRetry("DeepSeek quiz hint", async () => {
    const response = await model.invoke([
      new SystemMessage(buildHintSystemPrompt()),
      new HumanMessage(
        buildHintUserPrompt({
          prompt: context.prompt,
          choices: context.choices,
          pdfText: text,
          truncated,
          maxChars,
        }),
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return hintLlmSchema.parse(parsed);
  });

  assertDoesNotContainCorrectChoice(
    output.hint,
    context.correctChoiceText,
    "Hint",
  );

  return output;
}

export type LearnMoreGenerationContext = {
  prompt: string;
  choices: string[];
  correctChoiceText: string;
  objectiveStatement?: string | null;
  extractedText: string;
};

/**
 * Short PDF-grounded mini-lesson that must not reveal the MCQ answer.
 */
export async function generateQuizLearnMore(
  context: LearnMoreGenerationContext,
): Promise<LearnMoreLlmOutput> {
  const { text, truncated, maxChars } = truncatePdfTextForLearnMore(
    context.extractedText,
  );
  if (!text) {
    throw new Error("PDF extracted text is empty.");
  }

  const model = createDeepSeekChat(0.35);

  const output = await withJsonRetry("DeepSeek learn-more", async () => {
    const response = await model.invoke([
      new SystemMessage(buildLearnMoreSystemPrompt()),
      new HumanMessage(
        buildLearnMoreUserPrompt({
          prompt: context.prompt,
          choices: context.choices,
          objectiveStatement: context.objectiveStatement,
          pdfText: text,
          truncated,
          maxChars,
        }),
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return learnMoreLlmSchema.parse(parsed);
  });

  const combined = [
    output.topicSummary,
    ...(output.keyIdeas ?? []),
  ].join("\n");
  assertDoesNotContainCorrectChoice(
    combined,
    context.correctChoiceText,
    "Learn more",
  );

  return output;
}
