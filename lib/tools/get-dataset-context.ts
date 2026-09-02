import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { prisma } from "@/lib/db";

const schema = z.object({
  datasetIds: z.array(z.string()).optional(),
  tableNames: z.array(z.string()).optional(),
});

export const getDatasetContext = tool(
  async ({ datasetIds, tableNames }) => {
    const datasets = await prisma.dataset.findMany({
      where: {
        status: "READY",

        ...(datasetIds?.length
          ? {
              id: {
                in: datasetIds,
              },
            }
          : {}),

        ...(tableNames?.length
          ? {
              tableName: {
                in: tableNames,
              },
            }
          : {}),
      },

      include: {
        context: true,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return JSON.stringify({
      datasets: datasets.map((dataset) => ({
        id: dataset.id,
        fileName: dataset.fileName,
        tableName: dataset.tableName,
        rowCount: dataset.rowCount,
        columns: dataset.columns,
        context: dataset.context?.context ?? null,
      })),
    });
  },
  {
    name: "get_dataset_context",
    description:
      "Retrieve the semantic understanding and metadata of the merchant's analyzed datasets. Use this to understand available tables, columns, entities, and what the data represents before querying actual records.",
    schema,
  },
);