import { StructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";

import { logAgentEvent } from "./auditSink";

export function withAudit<T extends StructuredTool>(
  tool: T,
): T {
  const originalInvoke = tool.invoke.bind(tool);
  const wrappedInvoke = ((
    input: unknown,
    options?: RunnableConfig,
  ) => {
    const startedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const safePreview = safePreviewInput(input);
    logAgentEvent({
      level: "info",
      type: "agent.tool.start",
      message: `Tool: ${tool.name}`,
      meta: { tool: tool.name, input: safePreview },
    });
    return Promise.resolve(
      originalInvoke(input as Parameters<T["invoke"]>[0], options),
    )
      .then((result) => {
        const durationMs = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
            startedAt,
        );
        const resultSize = sizeOf(result);
        logAgentEvent({
          level: "ok",
          type: "agent.tool.end",
          message: `Tool ${tool.name} completed in ${durationMs}ms`,
          meta: { tool: tool.name, durationMs, resultSize },
        });
        return result;
      })
      .catch((err: unknown) => {
        const durationMs = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
            startedAt,
        );
        const message = err instanceof Error ? err.message : String(err);
        logAgentEvent({
          level: "error",
          type: "agent.tool.error",
          message: `Tool ${tool.name} failed: ${message}`,
          meta: { tool: tool.name, durationMs, error: message },
        });
        throw err;
      });
  }) as T["invoke"];

  const proto = Object.getPrototypeOf(tool);
  const clone = Object.create(proto) as T;
  Object.assign(clone, tool);
  (clone as { invoke: T["invoke"] }).invoke = wrappedInvoke;
  return clone;
}

function safePreviewInput(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === "string") {
    return input.length > 240 ? `${input.slice(0, 240)}…` : input;
  }
  if (typeof input === "object") {
    try {
      const json = JSON.stringify(input);
      return json.length > 400 ? `${json.slice(0, 400)}…` : JSON.parse(json);
    } catch {
      return String(input);
    }
  }
  return input;
}

function sizeOf(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}
