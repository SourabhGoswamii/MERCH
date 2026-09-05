import { NextRequest, NextResponse } from "next/server";

import { SEMANTIC_PROMPT } from "@/lib/prompts";

type AnalyzeRequest = {
  table_name: string;
  file_name: string;

  columns: {
    name: string;
    original_name: string;
    type: string;
  }[];

  sample_rows: Record<string, string>[];
};

type SemanticObject = {
  table: string;
  entity: string;
  description: string;
  columns: Record<string, string>;
};

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as AnalyzeRequest;

    if (
      !body.table_name ||
      !body.columns ||
      !body.sample_rows
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid analysis request",
        },
        {
          status: 400,
        },
      );
    }

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENROUTER_API_KEY is not configured",
        },
        {
          status: 500,
        },
      );
    }

    const columnInformation =
      body.columns
        .map(
          (column) =>
            `- ${column.name} | original: "${column.original_name}" | type: ${column.type}`,
        )
        .join("\n");

    const sampleData =
      JSON.stringify(
        body.sample_rows,
        null,
        2,
      );

    const systemPrompt = SEMANTIC_PROMPT;

    const userPrompt = `
Dataset:
Table name:
${body.table_name}

File name:
${body.file_name}

Columns:
${columnInformation}

Sample rows:
${sampleData}
`;

    console.log(
      `Analyzing dataset: ${body.table_name}`,
    );

    const ANALYSIS_TIMEOUT_MS = 60_000;
    const abort = new AbortController();
    const timer = setTimeout(
      () => abort.abort(),
      ANALYSIS_TIMEOUT_MS,
    );

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model:
            process.env.OPENROUTER_MODEL ||
            "openai/gpt-4o-mini",

          temperature: 0.5,

          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          response_format: {
            type: "json_object",
          },
        }),
        signal: abort.signal,
      },
    );
    clearTimeout(timer);

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "OpenRouter error:",
        errorText,
      );

      return NextResponse.json(
        {
          error:
            "AI analysis failed",
          details: errorText,
        },
        {
          status: 500,
        },
      );
    }

    const result =
      await response.json();

    const content =
      result?.choices?.[0]?.message
        ?.content;

    if (!content) {
      throw new Error(
        "AI returned empty analysis",
      );
    }

    let semanticObject: SemanticObject;

    try {
      semanticObject =
        JSON.parse(content);
    } catch {
      console.error(
        "Invalid AI JSON:",
        content,
      );

      throw new Error(
        "AI returned invalid JSON",
      );
    }

    if (
      !semanticObject.table ||
      !semanticObject.entity ||
      !semanticObject.description ||
      !semanticObject.columns
    ) {
      throw new Error(
        "AI returned incomplete semantic object",
      );
    }

    return NextResponse.json(
      semanticObject,
    );
  } catch (error) {
    console.error(
      "Analysis error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze dataset",
      },
      {
        status: 500,
      },
    );
  }
}