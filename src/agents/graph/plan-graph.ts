/**
 * Step 3 keeps Postgres as the durable source of truth.
 * A thin LangGraph interrupt graph can wrap generateLessonPlanFromPdfText in Step 4+.
 * For now, call the DeepSeek client + domain services directly.
 */
export { generateLessonPlanFromPdfText } from "@/agents/llm/deepseek";
