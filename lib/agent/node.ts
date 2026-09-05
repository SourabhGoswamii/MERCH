import { AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { Runnable } from "@langchain/core/runnables";
import { z } from "zod";

import {
  getDatasetContext,
  getLogbook,
  queryDataset,
  webSearch,
  writeLogbook,
} from "@/lib/tools/index";

import { extractText } from "./extractText";

import { AGENT_SYSTEM_PROMPT as SYSTEM_PROMPT } from "@/lib/prompts";

import type { AgentState, Insight } from "./state";

export { SYSTEM_PROMPT };

const tools = [
  getDatasetContext,
  queryDataset,
  webSearch,
  getLogbook,
  writeLogbook,
];

function createModel(): ChatOpenRouter {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  const model =
    process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  return new ChatOpenRouter({
    apiKey,
    model,
    temperature: 0.4,
  });
}

let _llm: ChatOpenRouter | null = null;
let _llmWithTools: Runnable | null = null;

function getLlm(): ChatOpenRouter {
  if (!_llm) _llm = createModel();
  return _llm;
}

function getLlmWithTools(): Runnable {
  if (!_llmWithTools) {
    _llmWithTools = getLlm().bindTools(tools);
  }
  return _llmWithTools;
}

export async function agentNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const system = new SystemMessage(SYSTEM_PROMPT);
  const messages: BaseMessage[] = [system, ...state.messages];
  const response = await getLlmWithTools().invoke(messages);
  const toolCalls = (response as AIMessage).tool_calls?.length ?? 0;
  return {
    messages: [response],
    toolCallCount: toolCalls,
  };
}

const InsightSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  recommendedAction: z.string().optional(),
});

const InsightsSchema = z.object({
  insights: z.array(InsightSchema).default([]),
});

export async function formatInsightsNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  let last = [...state.messages]
    .reverse()
    .find((m) => m instanceof AIMessage) as AIMessage | undefined;
  if (!last) return { insights: [] };

  const lastHasText =
    typeof last.content === "string"
      ? last.content.trim().length > 0
      : Array.isArray(last.content)
        ? last.content.length > 0
        : false;

  let newMessages: BaseMessage[] = [];
  if (!lastHasText || (Array.isArray(last.tool_calls) && last.tool_calls.length > 0)) {
    const synth = new SystemMessage(
      `You have reached the maximum number of tool calls. Based on the
conversation and tool results so far, write the final business answer the
merchant should see. Follow the same answer style as the system prompt:
Finding / Evidence / Why it matters / Recommended next step. Do not call
any more tools. Do not include JSON, markdown, or code fences.`,
    );
    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
      synth,
    ];
    try {
      const finalAi = await getLlm().invoke(messages);
      newMessages = [finalAi];
      last = finalAi as AIMessage;
    } catch {
      // ignore synthesis errors
    }
  }

  const lastContent = extractText(last.content);

  const transcript = state.messages
    .map((m) => {
      try {
        const role =
          m.getType() === "system"
            ? "system"
            : m.getType() === "human"
              ? "user"
              : m.getType() === "ai"
                ? "assistant"
                : m.getType() === "tool"
                  ? "tool"
                  : "other";
        const content = extractText(m.content);
        return `${role}: ${content}`;
      } catch {
        return "other: <unserializable>";
      }
    })
    .join("\n");

  const extractionPrompt = [
    new SystemMessage(
      `You extract structured business insights from a MerchMind agent
conversation. The merchant only sees the assistant's final text plus your
insights array. Keep insights actionable, evidence-based, and non-overlapping.
Return valid JSON matching the provided schema. If the final message is a
clarifying question or contains no insight, return an empty insights array.`,
    ),
    new SystemMessage(`Conversation:\n${transcript}`),
    new SystemMessage(`Final assistant message:\n${lastContent}`),
  ];

  const structured = getLlm().withStructuredOutput(InsightsSchema);
  try {
    const parsed = await structured.invoke(extractionPrompt);
    const insights = Array.isArray(parsed?.insights)
      ? (parsed.insights as Insight[])
      : [];
    return {
      insights,
      messages: newMessages.length > 0 ? newMessages : [],
    };
  } catch {
    return { insights: [], messages: newMessages };
  }
}
