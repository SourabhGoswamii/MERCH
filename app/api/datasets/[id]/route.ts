import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TABLE_NAME_RE = /^[a-z0-9_]{1,64}$/;

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext<"/api/datasets/[id]">,
) {
  const { id } = await params;

  const dataset = await prisma.dataset.findUnique({
    where: { id },
    select: { id: true, tableName: true },
  });

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  if (!TABLE_NAME_RE.test(dataset.tableName)) {
    return NextResponse.json(
      { error: "Invalid dataset table name" },
      { status: 500 },
    );
  }

  try {
    await prisma.$executeRawUnsafe(
      `DROP TABLE IF EXISTS "${dataset.tableName}"`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to drop dataset table";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  /*
   * DatasetContext cascades via onDelete: Cascade. Then drop the Dataset row.
   */
  await prisma.dataset.delete({ where: { id: dataset.id } });

  return NextResponse.json({ success: true, id: dataset.id });
}
