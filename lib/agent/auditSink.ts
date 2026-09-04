"use server";

import type { ServerAuditEvent } from "@/lib/serverAudit";

declare global {
  var __merchmind_agent_log:
    | ((event: Omit<ServerAuditEvent, "ts">) => void)
    | undefined;
}

export function setAgentLogSink(
  sink: ((event: Omit<ServerAuditEvent, "ts">) => void) | null,
) {
  if (sink) {
    globalThis.__merchmind_agent_log = sink;
  } else {
    delete globalThis.__merchmind_agent_log;
  }
}

export function logAgentEvent(event: Omit<ServerAuditEvent, "ts">): void {
  globalThis.__merchmind_agent_log?.(event);
}
