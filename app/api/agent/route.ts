import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";

import { compiledAgent } from "@/lib/agent/graph";
import { setAgentLogSink } from "@/lib/agent/auditSink";
import { extractText } from "@/lib/agent/extractText";
import { INITIAL_ANALYSIS_PROMPT } from "@/lib/prompts";
import type { AgentState } from "@/lib/agent/state";

type AgentRequest = {
  mode?: "initial_analysis" | "chat";
  message?: string;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: AgentRequest;
  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const mode: AgentState["mode"] =
    body.mode === "initial_analysis" ? "initial_analysis" : "chat";

  const userText =
    mode === "chat" ? (body.message ?? "").trim() : INITIAL_ANALYSIS_PROMPT;

  if (!userText) {
    return new Response(
      JSON.stringify({ error: "message is required when mode is 'chat'" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeSend = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line + "\n"));
        } catch {
          /* closed */
        }
      };

      const send = (event: Record<string, unknown>) =>
        safeSend(JSON.stringify(event));

      send({
        ts: Date.now(),
        level: "info",
        type: "agent.start",
        message: `Agent ${mode} started`,
        meta: { mode },
      });

      setAgentLogSink((event) => {
        send({ ...event, ts: Date.now() });
      });

      const flushTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          /* closed */
        }
      }, 50);

      try {
        const finalState = await compiledAgent.invoke(
          {
            mode,
            messages: [new HumanMessage(userText)],
            insights: [],
            toolCallCount: 0,
          } as Partial<AgentState>,
          { recursionLimit: 30 },
        );

        const lastAi = [...(finalState.messages ?? [])]
          .reverse()
          .find((m) => m.getType() === "ai");
        const responseText = extractText(lastAi?.content);

        const result = {
          success: true,
          response: responseText,
          insights: finalState.insights ?? [],
          mode: finalState.mode ?? mode,
        };

        send({
          level: "ok",
          type: "agent.end",
          message: `Agent ${mode} complete`,
          meta: { mode, insightCount: result.insights.length },
        });
        safeSend(JSON.stringify({ type: "result", data: result }));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Agent request failed";
        send({
          level: "error",
          type: "agent.error",
          message,
          meta: { mode, error: message },
        });
        safeSend(JSON.stringify({ type: "error", error: message }));
        controller.close();
      } finally {
        clearInterval(flushTimer);
        setAgentLogSink(null);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
