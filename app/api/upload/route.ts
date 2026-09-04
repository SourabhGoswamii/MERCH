import { NextRequest, NextResponse } from "next/server";

import { createSession } from "./_lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileName?: string;
      totalSize?: number;
    };
    const fileName = (body.fileName ?? "").trim();
    const totalSize = Number(body.totalSize ?? 0);
    if (!fileName || !fileName.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "fileName must be a .csv file" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(totalSize) || totalSize <= 0) {
      return NextResponse.json(
        { error: "totalSize must be a positive number" },
        { status: 400 },
      );
    }
    const session = await createSession(fileName, totalSize);
    return NextResponse.json({ success: true, ...session });
  } catch (error) {
    console.error("upload session create error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create upload session",
      },
      { status: 500 },
    );
  }
}
