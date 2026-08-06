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
