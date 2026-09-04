import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const AgentModeSchema = Annotation.Root({
  ...MessagesAnnotation.spec,

  mode: Annotation<"initial_analysis" | "chat">({
    reducer: (_x, update) => update,
    default: () => "chat" as const,
  }),

  insights: Annotation<Insight[]>({
    reducer: (_x, update) => update,
    default: () => [],
  }),

  toolCallCount: Annotation<number>({
    reducer: (x, update) => (x ?? 0) + (update ?? 0),
    default: () => 0,
  }),
});

export type Insight = {
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  recommendedAction?: string;
};

export type AgentState = {
  messages: BaseMessage[];
  mode: "initial_analysis" | "chat";
  insights: Insight[];
  toolCallCount: number;
};

export const MAX_TOOL_CALLS = 8;
