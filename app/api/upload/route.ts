import { NextRequest, NextResponse } from "next/server";

import Papa from "papaparse";

import { DatasetStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

// Keep batches below PostgreSQL's parameter limit. File-level concurrency is
// handled by the upload screen, which is much safer than parallel batches.
const BATCH_SIZE = 500;

type Column = { original: string; name: string; type: string };

function sanitizeName(value: string, fallback: string) {
  const name = value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return name || fallback;
}

function createTableName(fileName: string) {
  const base = sanitizeName(fileName.replace(/\.csv$/i, ""), "dataset");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${base.slice(0, 48)}_${suffix}`;
}

function makeUniqueColumnNames(columns: string[]) {
  const used = new Map<string, number>();
  return columns.map((original) => {
    const base = sanitizeName(original, "column");
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return { original, name: count === 1 ? base : `${base}_${count}` };
  });
}

function detectType(values: string[]) {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean);
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((value) => !Number.isNaN(Number(value)))) return "DOUBLE PRECISION";
  if (nonEmpty.every((value) => !Number.isNaN(new Date(value).getTime()) && /[-/]/.test(value))) return "TIMESTAMP";
  return "TEXT";
}

async function insertBatch(tableName: string, columns: Column[], rows: Record<string, string>[]) {
  if (!rows.length) return;
  const values: unknown[] = [];
  const groups = rows.map((row) => {
    const placeholders = columns.map((column) => {
      const value = row[column.original];
      values.push(value === undefined || value.trim() === "" ? null : value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const columnNames = columns.map((column) => `"${column.name}"`).join(", ");
  await prisma.$executeRawUnsafe(`INSERT INTO "${tableName}" (${columnNames}) VALUES ${groups.join(", ")}`, ...values);
}

export async function POST(request: NextRequest) {
  try {
    const files = (await request.formData()).getAll("files") as File[];
    if (!files.length) return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    if (files.length > 1) return NextResponse.json({ error: "Upload one file per request" }, { status: 400 });

    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: `${file.name} is not a CSV file` }, { status: 400 });
    }
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
      return NextResponse.json({ error: `Failed to parse ${file.name}`, details: parsed.errors }, { status: 400 });
    }
    const originalColumns = parsed.meta.fields ?? [];
    if (!originalColumns.length) return NextResponse.json({ error: `${file.name} has no columns` }, { status: 400 });

    const rows = parsed.data;
    const columns: Column[] = makeUniqueColumnNames(originalColumns).map((column) => ({
      ...column,
      type: detectType(rows.map((row) => row[column.original] ?? "")),
    }));
    const tableName = createTableName(file.name);
    const dataset = await prisma.dataset.create({
      data: { fileName: file.name, tableName, columns, status: DatasetStatus.UPLOADING },
    });

    try {
      const definitions = columns.map((column) => `"${column.name}" ${column.type}`).join(", ");
      await prisma.$executeRawUnsafe(`CREATE TABLE "${tableName}" (${definitions})`);
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        await insertBatch(tableName, columns, rows.slice(start, start + BATCH_SIZE));
      }
      const readyForAnalysis = await prisma.dataset.update({
        where: { id: dataset.id },
        data: { rowCount: rows.length, status: DatasetStatus.ANALYZING },
      });
      console.log({ success: true, dataset: readyForAnalysis });
      return NextResponse.json({ success: true, dataset: readyForAnalysis });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Database upload failed";
      await prisma.dataset.update({ where: { id: dataset.id }, data: { status: DatasetStatus.FAILED, error: message } });
      throw error;
    }
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to process file" }, { status: 500 });
  }
}
