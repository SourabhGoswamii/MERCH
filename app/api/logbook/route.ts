import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import type { InputJsonValue } from "@/app/generated/prisma/internal/prismaNamespace";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["ANALYSIS", "INSIGHT", "DECISION", "RESEARCH"] as const;
type LogbookType = (typeof VALID_TYPES)[number];

function toJsonValue(value: unknown): InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as InputJsonValue;
}

export async function POST(request: NextRequest) {
  let body: {
    title?: unknown;
    summary?: unknown;
    type?: unknown;
    evidence?: unknown;
    datasetIds?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";

  if (!title || !summary) {
    return NextResponse.json(
      { error: "title and summary are required" },
      { status: 400 },
    );
  }

  const type: LogbookType =
    typeof body.type === "string" &&
    (VALID_TYPES as readonly string[]).includes(body.type)
      ? (body.type as LogbookType)
      : "INSIGHT";

  const entry = await prisma.logbookEntry.create({
    data: {
      type,
      title,
      summary,
      evidence:
        body.evidence && typeof body.evidence === "object"
          ? toJsonValue(body.evidence)
          : undefined,
      datasetIds: Array.isArray(body.datasetIds)
        ? toJsonValue(
            body.datasetIds.filter((id): id is string => typeof id === "string"),
          )
        : undefined,
    },
  });

  return NextResponse.json({ success: true, entry });
}
