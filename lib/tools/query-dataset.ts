import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { prisma } from "@/lib/db";

const schema = z.object({
  tableName: z.string().min(1),
  condition: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

function validateCondition(condition: string) {
  const blocked = [
    ";",
    "--",
    "/*",
    "*/",
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "TRUNCATE",
    "CREATE",
    "GRANT",
    "REVOKE",
  ];

  const upper = condition.toUpperCase();

  for (const token of blocked) {
    if (upper.includes(token)) {
      throw new Error("Unsafe condition detected.");
    }
  }
}

export const queryDataset = tool(
  async ({ tableName, condition, limit }) => {
    const dataset = await prisma.dataset.findUnique({
      where: {
        tableName,
      },
      select: {
        id: true,
        tableName: true,
        status: true,
      },
    });

    if (!dataset) {
      throw new Error("Dataset table not found.");
    }

    if (dataset.status !== "READY") {
      throw new Error("Dataset is not ready.");
    }

    if (condition) {
      validateCondition(condition);
    }

    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);

    const query = condition?.trim()
      ? `SELECT * FROM "${tableName}" WHERE ${condition} LIMIT ${safeLimit}`
      : `SELECT * FROM "${tableName}" LIMIT ${safeLimit}`;

    const rows = await prisma.$queryRawUnsafe<
      Record<string, unknown>[]
    >(query);

    return JSON.stringify({
      tableName,
      count: rows.length,
      rows,
    });
  },
  {
    name: "query_dataset",
    description:
      "Query actual records from a merchant dataset. Use a valid table name from get_dataset_context and provide an optional SQL WHERE condition. This tool is read-only and returns a limited number of rows.",
    schema,
  },
);