import { NextRequest } from "next/server";

import { assembleAndIngest } from "@/app/api/upload/_lib/session";
import {
  isValidSessionId,
  subscribe,
  type ServerAuditEvent,
} from "@/lib/serverAudit";

export const dynamic = "force-dynamic";

const FLUSH_INTERVAL_MS = 50;

export async function POST(
  _request: NextRequest,
  { params }: RouteContext<"/api/upload/[sessionId]/finalize">,
) {
  const { sessionId } = await params;

  if (!isValidSessionId(sessionId)) {
    return new Response(
      JSON.stringify({ error: "Invalid sessionId" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (
        event:
          | ServerAuditEvent
          | { type: "result"; data: unknown }
          | { type: "error"; error: string },
      ) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* closed */
        }
      };

      const flushTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          /* closed */
        }
      }, FLUSH_INTERVAL_MS);

      const unsubscribe = subscribe(sessionId, send);

      try {
        const result = await assembleAndIngest(sessionId);
        send({ type: "result", data: { success: true, ...result } });
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Finalize failed";
        send({ type: "error", error: message });
        controller.close();
      } finally {
        clearInterval(flushTimer);
        unsubscribe();
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
