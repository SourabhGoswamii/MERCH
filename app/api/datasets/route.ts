import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const datasets = await prisma.dataset.findMany({
    include: { context: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ datasets });
}
