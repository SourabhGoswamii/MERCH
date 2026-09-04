import { NextRequest, NextResponse } from "next/server";

import { ingestCsvString } from "@/app/api/upload/_lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

function isServerless(): boolean {
  return (
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.LAMBDA_TASK_ROOT
  );
}

export function GET() {
  /*
   * Tells the client whether chunked uploads are safe. On serverless
   * platforms chunks land in isolated /tmp directories per invocation,
   * so we force a single-shot upload instead.
   */
  return NextResponse.json({
    chunked: !isServerless(),
    maxBytes: MAX_BYTES,
  });
}

export async function POST(request: NextRequest) {
  let fileName: string | null = null;
  let buffer: Buffer | null = null;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const fileEntry = form.get("file");
      if (!(fileEntry instanceof File)) {
        return NextResponse.json(
          { error: "Missing 'file' part" },
          { status: 400 },
        );
      }
      fileName = fileEntry.name || "upload.csv";
      if (fileEntry.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `File exceeds ${MAX_BYTES} bytes` },
          { status: 413 },
        );
      }
      buffer = Buffer.from(await fileEntry.arrayBuffer());
    } else {
      fileName = (request.headers.get("x-file-name") ?? "").trim();
      const raw = await request.arrayBuffer();
      if (!fileName || !fileName.toLowerCase().endsWith(".csv")) {
        return NextResponse.json(
          { error: "x-file-name header must be a .csv file" },
          { status: 400 },
        );
      }
      if (raw.byteLength === 0) {
        return NextResponse.json(
          { error: "Empty body" },
          { status: 400 },
        );
      }
      if (raw.byteLength > MAX_BYTES) {
        return NextResponse.json(
          { error: `File exceeds ${MAX_BYTES} bytes` },
          { status: 413 },
        );
      }
      buffer = Buffer.from(raw);
    }

    const csv = buffer.toString("utf-8");
    const result = await ingestCsvString({ fileName, csv });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
