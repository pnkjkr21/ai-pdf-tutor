import { ChatOpenAI } from "@langchain/openai";

import {
  getDeepSeekApiKey,
  getDeepSeekBaseUrl,
  getDeepSeekModel,
} from "@/lib/env";

export function createDeepSeekChat(temperature = 0.2): ChatOpenAI {
  return new ChatOpenAI({
    model: getDeepSeekModel(),
    apiKey: getDeepSeekApiKey(),
    temperature,
    configuration: {
      baseURL: getDeepSeekBaseUrl(),
    },
  });
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export function isNonRetryableLlmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|authentication|api key|insufficient/i.test(message);
}

export function messageContentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content);
}
