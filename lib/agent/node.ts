import { AgentStateType } from "./state";

export async function plannerNode(state: AgentStateType) {
  console.log("PLANNER");

  return {
    messages: ["Planner executed"],
    nextStep: "executor",
  };
}

export async function executorNode(state: AgentStateType) {
  console.log("EXECUTOR");

  return {
    messages: ["Executor executed"],
    toolResults: [
      {
        tool: "demoTool",
        result: "Demo tool result",
      },
    ],
    nextStep: "evaluator",
  };
}

export async function evaluatorNode(state: AgentStateType) {
  console.log("EVALUATOR");

  const shouldContinue =
    state.toolResults.length < 2;

  return {
    messages: [
      shouldContinue
        ? "More analysis required"
        : "Analysis complete",
    ],

    nextStep: shouldContinue
      ? "planner"
      : "responder",
  };
}

export async function responderNode(state: AgentStateType) {
  console.log("RESPONDER");

  return {
    messages: ["Final response generated"],
    recommendations: [
      {
        title: "Demo recommendation",
        reason: "Demo analysis completed",
      },
    ],
    nextStep: "end",
  };
}