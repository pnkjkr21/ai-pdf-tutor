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
import {
  hintLlmSchema,
  MAX_HINTS_PER_QUESTION,
  type HintLlmOutput,
} from "@/agents/schemas/hint";
import {
  learnMoreLlmSchema,
  type LearnMoreLlmOutput,
} from "@/agents/schemas/learn-more";
import {
  buildLearnMoreSystemPrompt,
  buildLearnMoreUserPrompt,
  truncatePdfTextForLearnMore,
} from "@/agents/prompts/learn-more";
import {
  buildStudyTipsSystemPrompt,
  buildStudyTipsUserPrompt,
  truncatePdfTextForStudyTips,
} from "@/agents/prompts/study-tips";
import {
  studyTipsLlmSchema,
  type StudyTipsLlmOutput,
} from "@/agents/schemas/study-tips";
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

export type GenerateLessonPlanOptions = {
  /** When set (regenerate), model revises this plan instead of starting cold. */
  previousPlan?: {
    title: string;
    difficulty: string;
    summary: string | null;
    objectives: string[];
  };
};

/**
 * True when the new plan is mostly a paraphrase of the previous one.
 * Compares title + each objective against prior objectives.
 */
function lessonPlanTooSimilar(
  next: LessonPlanLlmOutput,
  previous: NonNullable<GenerateLessonPlanOptions["previousPlan"]>,
): boolean {
  const titleSimilar = hintTooSimilar(next.title, previous.title, 0.5);
  let similarObjectives = 0;
  for (const objective of next.objectives) {
    if (
      previous.objectives.some((prev) => hintTooSimilar(objective, prev, 0.55))
    ) {
      similarObjectives += 1;
    }
  }
  const majoritySimilar =
    similarObjectives >= Math.ceil(next.objectives.length * 0.6);
  const sameCount = next.objectives.length === previous.objectives.length;
  return majoritySimilar && (titleSimilar || sameCount);
}

/**
 * Generate a Zod-validated lesson plan from PDF text via DeepSeek.
 * Optional previousPlan enables revise-from-prior regenerate.
 */
export async function generateLessonPlanFromPdfText(
  extractedText: string,
  options?: GenerateLessonPlanOptions,
): Promise<LessonPlanLlmOutput> {
  const { text, truncated, maxChars } = truncatePdfTextForPlan(extractedText);
  if (!text) {
    throw new Error("PDF extracted text is empty.");
  }

  const previousPlan = options?.previousPlan;
  const isRevision = Boolean(previousPlan);
  const model = createDeepSeekChat(isRevision ? 0.55 : 0.2);

  async function invokeOnce(extraInstruction?: string): Promise<LessonPlanLlmOutput> {
    const userPrompt = buildLessonPlanUserPrompt({
      pdfText: text,
      truncated,
      maxChars,
      previousPlan,
    });
    const response = await model.invoke([
      new SystemMessage(buildLessonPlanSystemPrompt(isRevision)),
      new HumanMessage(
        extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt,
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return lessonPlanLlmSchema.parse(parsed);
  }

  return withJsonRetry("DeepSeek lesson plan", async () => {
    let candidate = await invokeOnce();
    if (previousPlan && lessonPlanTooSimilar(candidate, previousPlan)) {
      candidate = await invokeOnce(
        [
          "Your last draft was too similar to the previous plan.",
          "Rewrite with a clearly different title, summary, and objective set.",
          "Change focus and wording — do not paraphrase the prior objectives.",
        ].join(" "),
      );
    }
    return candidate;
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
  /** Prior hints for this question; follow-ups must use a different angle. */
  previousHints?: string[];
};

function tokenizeForSimilarity(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Rough Jaccard overlap — used to reject near-paraphrase follow-up hints. */
export function hintTooSimilar(a: string, b: string, threshold = 0.55): boolean {
  const wa = tokenizeForSimilarity(a);
  const wb = tokenizeForSimilarity(b);
  if (wa.size === 0 || wb.size === 0) {
    return false;
  }
  let intersection = 0;
  for (const w of wa) {
    if (wb.has(w)) {
      intersection += 1;
    }
  }
  const union = wa.size + wb.size - intersection;
  return union > 0 && intersection / union >= threshold;
}

function resemblesPreviousHint(hint: string, previousHints: string[]): boolean {
  return previousHints.some((prev) => hintTooSimilar(hint, prev));
}

/**
 * Generate a Zod-validated hint that must not reveal the correct answer.
 * When previousHints are provided, asks for a new angle and retries once if too similar.
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

  const previousHints = (context.previousHints ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, MAX_HINTS_PER_QUESTION);

  const model = createDeepSeekChat(previousHints.length > 0 ? 0.55 : 0.4);

  async function invokeOnce(extraInstruction?: string): Promise<HintLlmOutput> {
    const userPrompt = buildHintUserPrompt({
      prompt: context.prompt,
      choices: context.choices,
      pdfText: text,
      truncated,
      maxChars,
      previousHints,
    });
    const response = await model.invoke([
      new SystemMessage(buildHintSystemPrompt()),
      new HumanMessage(
        extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt,
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return hintLlmSchema.parse(parsed);
  }

  const output = await withJsonRetry("DeepSeek quiz hint", async () => {
    let candidate = await invokeOnce();
    if (
      previousHints.length > 0 &&
      resemblesPreviousHint(candidate.hint, previousHints)
    ) {
      candidate = await invokeOnce(
        "Your last draft was too similar to a previous hint. Write a clearly different angle now.",
      );
    }
    return candidate;
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
 * Correct choice is sent as a forbidden phrase for the model to avoid.
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
  const forbiddenPhrase = context.correctChoiceText.trim();

  async function invokeOnce(extraInstruction?: string): Promise<LearnMoreLlmOutput> {
    const userPrompt = buildLearnMoreUserPrompt({
      prompt: context.prompt,
      choices: context.choices,
      forbiddenPhrase,
      objectiveStatement: context.objectiveStatement,
      pdfText: text,
      truncated,
      maxChars,
    });
    const response = await model.invoke([
      new SystemMessage(buildLearnMoreSystemPrompt()),
      new HumanMessage(
        extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt,
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    const output = learnMoreLlmSchema.parse(parsed);
    const combined = [output.topicSummary, ...(output.keyIdeas ?? [])].join(
      "\n",
    );
    // Enforce: no explicit giveaway. Verbatim topic words may still appear when
    // teaching; forbidden phrase in the prompt steers the model away from pasting the choice.
    assertDoesNotContainCorrectChoice(
      combined,
      context.correctChoiceText,
      "Learn more",
      "giveaway",
    );
    return output;
  }

  return withJsonRetry("DeepSeek learn-more", async () => {
    try {
      return await invokeOnce();
    } catch (firstError) {
      if (
        firstError instanceof Error &&
        /rejected/i.test(firstError.message) &&
        forbiddenPhrase
      ) {
        return invokeOnce(
          `Your previous draft spoiled the answer. Rewrite with ZERO use of this forbidden phrase: "${forbiddenPhrase}". Do not say which choice is correct.`,
        );
      }
      throw firstError;
    }
  });
}

export type StudyTipsGenerationContext = {
  title: string;
  strongAreas: Array<{ orderIndex: number; statement: string }>;
  weakAreas: Array<{ orderIndex: number; statement: string }>;
  metricsSummary: string;
  extractedText: string;
};

/**
 * Personalized study tips from PDF text + strong/weak objectives (no vector DB).
 */
export async function generateStudyTipsFromPdfText(
  context: StudyTipsGenerationContext,
): Promise<StudyTipsLlmOutput> {
  const { text, truncated, maxChars } = truncatePdfTextForStudyTips(
    context.extractedText,
  );
  if (!text) {
    throw new Error("PDF extracted text is empty.");
  }

  const model = createDeepSeekChat(0.4);

  return withJsonRetry("DeepSeek study tips", async () => {
    const response = await model.invoke([
      new SystemMessage(buildStudyTipsSystemPrompt()),
      new HumanMessage(
        buildStudyTipsUserPrompt({
          title: context.title,
          strongAreas: context.strongAreas,
          weakAreas: context.weakAreas,
          metricsSummary: context.metricsSummary,
          pdfText: text,
          truncated,
          maxChars,
        }),
      ),
    ]);
    const parsed = extractJsonObject(messageContentToString(response.content));
    return studyTipsLlmSchema.parse(parsed);
  });
}
