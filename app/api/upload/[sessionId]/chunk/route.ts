import { NextRequest, NextResponse } from "next/server";

import { emit, isValidSessionId, sessionExists } from "@/lib/serverAudit";
import { writeChunk } from "@/app/api/upload/_lib/session";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: RouteContext<"/api/upload/[sessionId]/chunk">,
) {
  const { sessionId } = await params;
  const url = new URL(request.url);
  const index = Number(url.searchParams.get("index") ?? "0");

  try {
    if (!isValidSessionId(sessionId)) {
      return NextResponse.json(
        { error: "Invalid sessionId" },
        { status: 400 },
      );
    }
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json(
        { error: "index must be a non-negative integer" },
        { status: 400 },
      );
    }

    if (!(await sessionExists(sessionId))) {
      return NextResponse.json(
        { error: "Unknown upload session" },
        { status: 404 },
      );
    }

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) {
      return NextResponse.json(
        { error: "Empty chunk body" },
        { status: 400 },
      );
    }

    emit(sessionId, {
      level: "info",
      type: "upload.chunk.start",
      message: `Receiving chunk ${index} (${body.byteLength} bytes)`,
      meta: { index, bytes: body.byteLength },
    });

    const ack = await writeChunk(sessionId, index, body);
    return NextResponse.json({ success: true, ...ack });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Chunk write failed";
    emit(sessionId, {
      level: "error",
      type: "upload.chunk.error",
      message: `Chunk ${index} failed: ${message}`,
      meta: { index, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
