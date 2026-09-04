"use client";

import { audit, type AuditEvent, type AuditLevel } from "@/lib/audit";

export type AgentStreamResult = {
  response: string;
  insights: Array<{
    title: string;
    summary: string;
    confidence: "high" | "medium" | "low";
    recommendedAction?: string;
  }>;
  mode: "initial_analysis" | "chat";
};

const ALLOWED_TYPES: AuditEvent["type"][] = [
  "agent.start",
  "agent.end",
  "agent.error",
  "agent.tool.start",
  "agent.tool.end",
  "agent.tool.error",
  "api.request",
  "api.response",
  "api.error",
  "warn",
  "error",
  "info",
];

type ServerEvent = {
  ts?: number;
  level?: AuditLevel;
  type: string;
  message?: string;
  meta?: Record<string, unknown>;
};

type FinalLine =
  | { type: "result"; data: AgentStreamResult }
  | { type: "error"; error: string };

export async function runAgentStream(
  args: { mode: "initial_analysis" | "chat"; message?: string },
  onProgress?: (event: ServerEvent) => void,
): Promise<AgentStreamResult> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: args.mode, message: args.message }),
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Agent request failed (${res.status}): ${txt}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: FinalLine | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as ServerEvent | FinalLine;
        if ("type" in parsed && parsed.type === "result") {
          final = parsed as FinalLine;
        } else if ("type" in parsed && parsed.type === "error") {
          final = parsed as FinalLine;
        } else {
          const evt = parsed as ServerEvent;
          onProgress?.(evt);
          if (ALLOWED_TYPES.includes(evt.type as AuditEvent["type"])) {
            audit.record({
              level: (evt.level ?? "info") as AuditLevel,
              type: evt.type as AuditEvent["type"],
              message: evt.message ?? evt.type,
              meta: evt.meta,
            });
          }
        }
      } catch {
        /* ignore malformed line */
      }
    }
  }

  if (final && "error" in final) throw new Error(final.error);
  if (final && "data" in final) return final.data;
  throw new Error("Agent stream ended without a result");
}
