import { promises as fs } from "node:fs";
import path from "node:path";

import Papa from "papaparse";

import { prisma } from "@/lib/db";
import { DatasetStatus } from "@/app/generated/prisma/client";
import {
  emit,
  ensureSessionDir,
  removeSessionDir,
  sessionDir,
} from "@/lib/serverAudit";

export const BATCH_SIZE = 500;
export const CHUNK_SIZE = 256 * 1024;

export type Column = { original: string; name: string; type: string };

export function sanitizeName(value: string, fallback: string): string {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return name || fallback;
}

export function createTableName(fileName: string): string {
  const base = sanitizeName(fileName.replace(/\.csv$/i, ""), "dataset");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${base.slice(0, 48)}_${suffix}`;
}

export function makeUniqueColumnNames(
  columns: string[],
): { original: string; name: string }[] {
  const used = new Map<string, number>();
  return columns.map((original) => {
    const base = sanitizeName(original, "column");
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return { original, name: count === 1 ? base : `${base}_${count}` };
  });
}

export function detectType(values: string[]): string {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !Number.isNaN(Number(v))))
    return "DOUBLE PRECISION";
  if (
    nonEmpty.every(
      (v) => !Number.isNaN(new Date(v).getTime()) && /[-/]/.test(v),
    )
  )
    return "TIMESTAMP";
  return "TEXT";
}

export async function insertBatch(
  tableName: string,
  columns: Column[],
  rows: Record<string, string>[],
): Promise<void> {
  if (!rows.length) return;
  const values: unknown[] = [];
  const groups = rows.map((row) => {
    const placeholders = columns.map((column) => {
      const value = row[column.original];
      values.push(
        value === undefined || value.trim() === "" ? null : value,
      );
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const columnNames = columns.map((c) => `"${c.name}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${tableName}" (${columnNames}) VALUES ${groups.join(", ")}`,
    ...values,
  );
}

export type CreateSessionResult = {
  sessionId: string;
  chunkSize: number;
  acceptedAt: number;
};

export async function createSession(
  fileName: string,
  totalSize: number,
): Promise<CreateSessionResult> {
  const sessionId = crypto.randomUUID();
  const dir = await ensureSessionDir(sessionId);
  await fs.writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify(
      { fileName, totalSize, chunkSize: CHUNK_SIZE, createdAt: Date.now() },
      null,
      2,
    ),
  );
  emit(sessionId, {
    level: "info",
    type: "upload.session.create",
    message: `Session created for ${fileName} (${totalSize} bytes)`,
    meta: { sessionId, fileName, totalSize, chunkSize: CHUNK_SIZE },
  });
  return { sessionId, chunkSize: CHUNK_SIZE, acceptedAt: Date.now() };
}

export async function readMeta(
  sessionId: string,
): Promise<{
  fileName: string;
  totalSize: number;
  chunkSize: number;
  createdAt: number;
}> {
  const dir = sessionDir(sessionId);
  const raw = await fs.readFile(path.join(dir, "meta.json"), "utf-8");
  return JSON.parse(raw);
}

export async function writeChunk(
  sessionId: string,
  index: number,
  body: ArrayBuffer,
): Promise<{ received: number; index: number; bytes: number }> {
  const dir = await ensureSessionDir(sessionId);
  const buf = Buffer.from(body);
  const filename = `chunk-${String(index).padStart(6, "0")}.bin`;
  await fs.writeFile(path.join(dir, filename), buf);
  emit(sessionId, {
    level: "ok",
    type: "upload.chunk.ack",
    message: `Chunk ${index} received (${buf.byteLength} bytes)`,
    meta: { sessionId, index, bytes: buf.byteLength },
  });
  return { received: 1, index, bytes: buf.byteLength };
}

export async function assembleAndIngest(sessionId: string): Promise<{
  datasetId: string;
  fileName: string;
  tableName: string;
  rowCount: number;
}> {
  const dir = sessionDir(sessionId);
  const meta = await readMeta(sessionId);

  emit(sessionId, {
    level: "info",
    type: "upload.assembled",
    message: `Assembling ${meta.fileName} from chunks`,
    meta: { sessionId },
  });

  const chunkFiles = (await fs.readdir(dir))
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".bin"))
    .sort();

  const buffers: Buffer[] = [];
  for (const f of chunkFiles) {
    buffers.push(await fs.readFile(path.join(dir, f)));
  }
  const csv = Buffer.concat(buffers).toString("utf-8");

  return ingestCsvString({
    fileName: meta.fileName,
    csv,
  });
}

export async function ingestCsvString(args: {
  fileName: string;
  csv: string;
}): Promise<{
  datasetId: string;
  fileName: string;
  tableName: string;
  rowCount: number;
}> {
  const { fileName, csv } = args;

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const fatalErrors = (parsed.errors ?? []).filter(
    (e) => e.type === "Quotes",
  );
  if (fatalErrors.length) {
    throw new Error(
      `Failed to parse ${fileName}: ${fatalErrors[0]?.message ?? "unknown"}`,
    );
  }

  const originalColumns = parsed.meta.fields ?? [];
  if (!originalColumns.length) {
    throw new Error(`${fileName} has no columns`);
  }
  const rows = parsed.data;

  const columns: Column[] = makeUniqueColumnNames(originalColumns).map(
    (c) => ({
      ...c,
      type: detectType(rows.map((r) => r[c.original] ?? "")),
    }),
  );

  const tableName = createTableName(fileName);
  let dataset;
  try {
    dataset = await prisma.dataset.create({
      data: {
        fileName,
        tableName,
        columns,
        status: DatasetStatus.UPLOADING,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create dataset row";
    throw error;
  }

  try {
    const definitions = columns
      .map((c) => `"${c.name}" ${c.type}`)
      .join(", ");
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${tableName}" (${definitions})`,
    );

    let inserted = 0;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      await insertBatch(tableName, columns, batch);
      inserted += batch.length;
    }

    const ready = await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        rowCount: rows.length,
        status: DatasetStatus.UPLOADING,
      },
    });
    return {
      datasetId: ready.id,
      fileName,
      tableName,
      rowCount: rows.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database upload failed";
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: { status: DatasetStatus.FAILED, error: message },
    });
    throw error;
  }
}
