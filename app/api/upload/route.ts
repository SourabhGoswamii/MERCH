import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";

import { prisma } from "@/lib/db";
import { analyzeTable } from "@/lib/analyzer";

const BATCH_SIZE = 500;

function sanitizeTableName(fileName: string) {
  const name = fileName
    .replace(/\.csv$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return name || "dataset";
}

function sanitizeColumnName(column: string) {
  const name = column
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return name || "column";
}

function makeUniqueColumnNames(columns: string[]) {
  const used = new Map<string, number>();

  return columns.map((column) => {
    const baseName = sanitizeColumnName(column);

    const count = used.get(baseName) ?? 0;

    used.set(baseName, count + 1);

    if (count === 0) {
      return {
        original: column,
        name: baseName,
      };
    }

    return {
      original: column,
      name: `${baseName}_${count + 1}`,
    };
  });
}

function detectType(values: string[]) {
  const nonEmpty = values
    .map((value) => value.trim())
    .filter(Boolean);

  if (nonEmpty.length === 0) {
    return "TEXT";
  }

  const isNumber = nonEmpty.every((value) => {
    return !isNaN(Number(value));
  });

  if (isNumber) {
    return "DOUBLE PRECISION";
  }

  const isDate = nonEmpty.every((value) => {
    const date = new Date(value);

    return (
      !isNaN(date.getTime()) &&
      /[-/]/.test(value)
    );
  });

  if (isDate) {
    return "TIMESTAMP";
  }

  return "TEXT";
}

async function insertBatch(
  tableName: string,
  columns: {
    original: string;
    name: string;
    type: string;
  }[],
  rows: Record<string, string>[],
) {
  if (rows.length === 0) {
    return;
  }

  const columnNames = columns
    .map((column) => `"${column.name}"`)
    .join(", ");

  const values: unknown[] = [];

  const valueGroups = rows.map((row) => {
    const placeholders = columns.map(
      (column) => {
        const value =
          row[column.original];

        values.push(
          value === undefined ||
            value.trim() === ""
            ? null
            : value,
        );

        return `$${values.length}`;
      },
    );

    return `(${placeholders.join(", ")})`;
  });

  const query = `
    INSERT INTO "${tableName}" (${columnNames})
    VALUES ${valueGroups.join(", ")}
  `;

  await prisma.$executeRawUnsafe(
    query,
    ...values,
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const formData =
      await request.formData();

    const files =
      formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        {
          error: "No files uploaded",
        },
        {
          status: 400,
        },
      );
    }

    const datasets = [];

    for (const file of files) {
      if (
        !file.name
          .toLowerCase()
          .endsWith(".csv")
      ) {
        return NextResponse.json(
          {
            error: `${file.name} is not a CSV file`,
          },
          {
            status: 400,
          },
        );
      }

      console.log(
        `\nProcessing ${file.name}...`,
      );

      const text = await file.text();

      const parsed =
        Papa.parse<Record<string, string>>(
          text,
          {
            header: true,
            skipEmptyLines: true,
          },
        );

      if (parsed.errors.length > 0) {
        return NextResponse.json(
          {
            error: `Failed to parse ${file.name}`,
            details: parsed.errors,
          },
          {
            status: 400,
          },
        );
      }

      const rows = parsed.data;

      const originalColumns =
        parsed.meta.fields ?? [];

      if (originalColumns.length === 0) {
        return NextResponse.json(
          {
            error: `${file.name} has no columns`,
          },
          {
            status: 400,
          },
        );
      }

      const tableName =
        sanitizeTableName(file.name);

      const columnNames =
        makeUniqueColumnNames(
          originalColumns,
        );

      const columns =
        columnNames.map((column) => ({
          original: column.original,
          name: column.name,
          type: detectType(
            rows.map(
              (row) =>
                row[column.original] ?? "",
            ),
          ),
        }));

      const columnDefinitions =
        columns
          .map(
            (column) =>
              `"${column.name}" ${column.type}`,
          )
          .join(", ");

      console.log(
        `Creating table: ${tableName}`,
      );

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          ${columnDefinitions}
        );
      `);

      console.log(
        `Inserting ${rows.length} rows...`,
      );

      for (
        let i = 0;
        i < rows.length;
        i += BATCH_SIZE
      ) {
        const batch = rows.slice(
          i,
          i + BATCH_SIZE,
        );

        await insertBatch(
          tableName,
          columns,
          batch,
        );

        console.log(
          `Inserted ${Math.min(
            i + BATCH_SIZE,
            rows.length,
          )}/${rows.length}`,
        );
      }

      console.log(
        `Database table ready: ${tableName}`,
      );

      console.log(
        `Starting AI analysis for ${tableName}...`,
      );

      const semanticObject =
        await analyzeTable(tableName);

      console.log(
        "\n========== AI DATA CONTEXT ==========",
      );

      console.log(
        JSON.stringify(
          semanticObject,
          null,
          2,
        ),
      );

      console.log(
        "=====================================\n",
      );

      datasets.push({
        table_name: tableName,
        file_name: file.name,
        row_count: rows.length,
        columns,
        semantic_object: semanticObject,
      });
    }

    return NextResponse.json({
      success: true,
      datasets,
    });
  } catch (error) {
    console.error(
      "Upload error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process files",
      },
      {
        status: 500,
      },
    );
  }
}