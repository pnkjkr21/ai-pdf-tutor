import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";

export const runtime = "nodejs";

/**
 * CopilotKit 1.6x+ requires at least one named agent (defaults to "default").
 * An empty `new CopilotRuntime()` causes:
 *   useAgent: Agent 'default' not found ... No agents registered.
 */
const tutorAgent = new BuiltInAgent({
  model: process.env.OPENAI_MODEL?.includes("/")
    ? process.env.OPENAI_MODEL
    : `openai/${process.env.OPENAI_MODEL || "gpt-4o-mini"}`,
  temperature: 0.4,
  maxSteps: 4,
  prompt: `You are a supportive PDF learning tutor.
Help the learner understand concepts from the uploaded PDF.
You may give hints and explanations of topics.
NEVER reveal or imply which MCQ choice is correct.
NEVER list the answer letter.
Always encourage the learner to use the quiz widget and finish the lesson.`,
});

const runtimeInstance = new CopilotRuntime({
  agents: {
    default: tutorAgent,
  },
});

// Service adapter is still required by the Next.js endpoint helper.
// With agents registered, chat goes through the BuiltInAgent.
const serviceAdapter = new ExperimentalEmptyAdapter();

const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
  runtime: runtimeInstance,
  serviceAdapter,
  endpoint: "/api/copilotkit",
});

export const POST = async (req: Request) => handleRequest(req);
export const GET = async (req: Request) => handleRequest(req);
