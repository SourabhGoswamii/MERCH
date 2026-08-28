import { prisma } from "@/lib/db";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

export async function analyzeTable(tableName: string) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const columns = await prisma.$queryRawUnsafe<
    {
      column_name: string;
      data_type: string;
    }[]
  >(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    tableName
  );

  if (columns.length === 0) {
    throw new Error(`Table "${tableName}" not found`);
  }

  const sampleRows = await prisma.$queryRawUnsafe<
    Record<string, unknown>[]
  >(
    `SELECT * FROM "${tableName}" LIMIT 10`
  );

  const prompt = `
You are a data semantic analyzer.

Analyze this dataset.

TABLE:
${tableName}

COLUMNS:
${JSON.stringify(columns, null, 2)}

SAMPLE ROWS:
${JSON.stringify(sampleRows, null, 2)}

Return ONLY valid JSON in exactly this format:

{
  "table": "table name",
  "entity": "real-world entity represented by one row",
  "description": "what one row represents",
  "columns": {
    "column_name": "simple explanation of the column"
  }
}

Rules:
- Include every column.
- Do not invent columns.
- Do not include sample rows.
- Keep descriptions concise.
- Return JSON only.
`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You convert database schemas into concise semantic context for an AI agent.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${error}`);
  }

  const result = await response.json();

  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter returned no content");
  }

  return JSON.parse(content);
}