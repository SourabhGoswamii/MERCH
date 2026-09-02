import { NextRequest, NextResponse } from "next/server";

import {
  getDatasetContext,
  queryDataset,
  webSearch,
  getLogbook,
  writeLogbook,
} from "@/lib/tools/index";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const toolName = body.tool;

    let result: unknown;

    switch (toolName) {
      case "get_dataset_context":
        result = await getDatasetContext.invoke(body.input ?? {});
        break;

      case "query_dataset":
        result = await queryDataset.invoke(body.input ?? {});
        break;

      case "web_search":
        result = await webSearch.invoke(body.input ?? {});
        break;

      case "get_logbook":
        result = await getLogbook.invoke(body.input ?? {});
        break;

      case "write_logbook":
        result = await writeLogbook.invoke(body.input ?? {});
        break;

      default:
        return NextResponse.json(
          {
            error: `Unknown tool: ${toolName}`,
          },
          { status: 400 },
        );
    }

    const normalizedResult =
      typeof result === "string" ? result : JSON.stringify(result);

    try {
      return NextResponse.json({
        success: true,
        result: JSON.parse(normalizedResult),
      });
    } catch {
      return NextResponse.json({
        success: true,
        result: normalizedResult,
      });
    }
  } catch (error) {
    console.error("Tool execution error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      },
      { status: 500 },
    );
  }
}
