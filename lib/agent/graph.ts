import {
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";

import { AgentState } from "./state";

import {
  plannerNode,
  executorNode,
  evaluatorNode,
  responderNode,
} from "./node";

function routeNextStep(state: typeof AgentState.State) {
  return state.nextStep;
}

const graph = new StateGraph(AgentState)

  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addNode("evaluator", evaluatorNode)
  .addNode("responder", responderNode)

  .addEdge(START, "planner")

  .addEdge("planner", "executor")

  .addEdge("executor", "evaluator")

  .addConditionalEdges(
    "evaluator",
    routeNextStep,
    {
      planner: "planner",
      responder: "responder",
    }
  )

  .addEdge("responder", END);

export const agent = graph.compile();