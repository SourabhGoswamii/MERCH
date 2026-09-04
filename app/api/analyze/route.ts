import { NextRequest, NextResponse } from "next/server";

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

    const systemPrompt = `
You are a data semantic analyzer for MerchMind.

Your job is to understand a business dataset from its
table name, column names, detected data types, and a small
sample of rows.

You are NOT doing business recommendations yet.

Your job is to create a reliable semantic description that
another AI agent will later use to understand the dataset.

Determine:

1. What real-world entity each row represents.
2. What the dataset represents overall.
3. What every column means.
4. The likely business meaning of identifiers, dates,
   amounts, quantities, statuses, categories, names,
   customer information, product information, etc.
5. Preserve the database column names exactly.
6. Do not invent information that cannot reasonably be
   inferred from the provided data.

For each column, explain its meaning and include its
detected data type.

Return ONLY valid JSON.

The JSON must have exactly this structure:

{
  "table": "table name",
  "entity": "singular real-world entity",
  "description": "clear description of what one row represents",
  "columns": {
    "column_name": "meaning of this column. Data type: TYPE."
  }
}

Do not return markdown.
Do not return code fences.
Do not return explanations outside JSON.
`;

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