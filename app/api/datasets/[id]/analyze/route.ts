import { NextRequest, NextResponse } from "next/server";

import { DatasetStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

type Column = { original: string; name: string; type: string };

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/datasets/[id]/analyze">,
) {
  const { id } = await params;
  const dataset = await prisma.dataset.findUnique({ where: { id } });

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  if (dataset.status === DatasetStatus.READY) {
    return NextResponse.json({ success: true, status: dataset.status });
  }

  await prisma.dataset.update({
    where: { id },
    data: { status: DatasetStatus.ANALYZING, error: null },
  });

  try {
    const columns = dataset.columns as Column[];
    const sampleRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${dataset.tableName}" LIMIT 5`,
    );

    const response = await fetch(new URL("/api/analyze", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_name: dataset.tableName,
        file_name: dataset.fileName,
        columns: columns.map((column) => ({
          name: column.name,
          original_name: column.original,
          type: column.type,
        })),
        sample_rows: sampleRows,
      }),
    });

    const context = await response.json();
    if (!response.ok) throw new Error(context.error ?? "AI analysis failed");

    await prisma.$transaction([
      prisma.datasetContext.upsert({
        where: { datasetId: id },
        create: { datasetId: id, context },
        update: { context },
      }),
      prisma.dataset.update({
        where: { id },
        data: { status: DatasetStatus.READY, error: null },
      }),
    ]);

    return NextResponse.json({ success: true, status: DatasetStatus.READY });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis failed";
    await prisma.dataset.update({
      where: { id },
      data: { status: DatasetStatus.FAILED, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
