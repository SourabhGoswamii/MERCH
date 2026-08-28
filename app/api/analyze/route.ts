import { NextRequest, NextResponse } from "next/server";
import { analyzeTable } from "@/lib/analyzer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const tableName = body.table_name;

    if (!tableName) {
      return NextResponse.json(
        {
          error: "table_name is required",
        },
        {
          status: 400,
        }
      );
    }

    const semanticObject = await analyzeTable(tableName);

    console.log(
      "\n========== AI DATA CONTEXT ==========\n"
    );

    console.log(
      JSON.stringify(semanticObject, null, 2)
    );

    console.log(
      "\n=====================================\n"
    );

    return NextResponse.json({
      success: true,
      context: semanticObject,
    });
  } catch (error) {
    console.error("Analyzer error:", error);

    return NextResponse.json(
      {
        error: "Failed to analyze dataset",
      },
      {
        status: 500,
      }
    );
  }
}