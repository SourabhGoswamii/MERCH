import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  merchantData: Annotation<any>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  toolResults: Annotation<any[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  opportunities: Annotation<any[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  recommendations: Annotation<any[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  nextStep: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "planner",
  }),
});

export type AgentStateType = typeof AgentState.State;