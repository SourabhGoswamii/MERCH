"use client";

import Papa from "papaparse";

import { audit, type AuditEvent } from "@/lib/audit";

const ROW_CHUNK_SIZE = 500;
const ROW_CHUNK_SIZE_DEFAULT = 500;

export type UploadProgress = {
  fileName: string;
  totalBytes: number;
  totalRows: number;
  totalChunks: number;
  chunksSent: number;
  rowsSent: number;
  state:
    | "idle"
    | "parsing"
    | "uploading"
    | "completed"
    | "failed";
  error?: string;
  datasetId?: string;
  tableName?: string;
};

export type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
  rowChunkSize?: number;
};

type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

async function parseCsvInBrowser(file: File): Promise<ParsedCsv> {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        resolve({
          headers: result.meta.fields ?? [],
          rows: result.data,
        });
      },
      error(err: Error) {
        reject(err);
      },
    });
  });
}

export async function uploadCsvInChunks(
  file: File,
  options: UploadOptions = {},
): Promise<UploadProgress> {
  const fileName = file.name;
  const totalBytes = file.size;
  const rowChunkSize = options.rowChunkSize ?? ROW_CHUNK_SIZE_DEFAULT;

  const progress: UploadProgress = {
    fileName,
    totalBytes,
    totalRows: 0,
    totalChunks: 0,
    chunksSent: 0,
    rowsSent: 0,
    state: "idle",
  };
  const update = (patch: Partial<UploadProgress>) => {
    Object.assign(progress, patch);
    options.onProgress?.(progress);
  };

  update({ state: "parsing" });
  audit.record({
    level: "info",
    type: "upload.session.create",
    message: `Parsing ${fileName} (${totalBytes} bytes)`,
    meta: { fileName, totalBytes, mode: "browser-parsed" },
  });

  let parsed: ParsedCsv;
  try {
    parsed = await parseCsvInBrowser(file);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse CSV";
    update({ state: "failed", error: message });
    audit.record({
      level: "error",
      type: "upload.error",
      message: `Parse failed for ${fileName}: ${message}`,
      meta: { fileName, error: message },
    });
    throw error;
  }

  if (!parsed.headers.length) {
    const message = `${fileName} has no columns`;
    update({ state: "failed", error: message });
    audit.record({
      level: "error",
      type: "upload.error",
      message,
      meta: { fileName },
    });
    throw new Error(message);
  }

  const totalRows = parsed.rows.length;
  const totalChunks = Math.max(1, Math.ceil(totalRows / rowChunkSize));
  update({ totalRows, totalChunks, state: "uploading" });

  audit.record({
    level: "info",
    type: "upload.session.create",
    message: `Sending ${totalRows} rows in ${totalChunks} chunk${totalChunks === 1 ? "" : "s"} of ${rowChunkSize}`,
    meta: {
      fileName,
      totalRows,
      totalChunks,
      chunkSize: rowChunkSize,
    },
  });

  /*
   * ponytail: chunks are sent sequentially, one at a time, in order.
   * This trades throughput for protocol simplicity and exact ordering
   * (rows never interleave, no out-of-order risk on a flaky network).
   * Upgrade path: bounded concurrency on the same dataset if the dataset
   * is large enough that throughput matters.
   */
  let datasetId: string | undefined;
  let tableName: string | undefined;
  let rowsSent = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * rowChunkSize;
    const end = Math.min(start + rowChunkSize, totalRows);
    const rows = parsed.rows.slice(start, end);
    const isLastChunk = chunkIndex === totalChunks - 1;

    /*
     * The client tells the server whether more chunks are coming. The
     * server no longer infers "last" from row count — that broke on
     * exact multiples of 500. A final chunk with 0 rows is valid
     * (e.g. a 1000-row file ends with `rows: []`, complete: true).
     */
    const body: {
      rows?: Record<string, string>[];
      complete: boolean;
      fileName?: string;
      headers?: string[];
    } = {
      rows,
      complete: isLastChunk,
    };
    if (!datasetId) {
      body.fileName = fileName;
      body.headers = parsed.headers;
    }

    let response: Response;
    try {
      response = datasetId
        ? await fetch(`/api/upload/${datasetId}/chunk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
      update({ state: "failed", error: message });
      audit.record({
        level: "error",
        type: "upload.error",
        message: `Chunk ${chunkIndex + 1}/${totalChunks} failed for ${fileName}: ${message}`,
        meta: { fileName, chunkIndex, error: message },
      });
      throw error;
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      const message = data.error ?? `Upload failed (${response.status})`;
      update({ state: "failed", error: message });
      audit.record({
        level: "error",
        type: "upload.error",
        message: `Chunk ${chunkIndex + 1}/${totalChunks} failed for ${fileName}: ${message}`,
        meta: { fileName, chunkIndex, status: response.status, error: message },
      });
      throw new Error(message);
    }

    const data = (await response.json()) as {
      datasetId?: string;
      tableName?: string;
      rowsReceived?: number;
      complete?: boolean;
    };

    datasetId = data.datasetId ?? datasetId;
    tableName = data.tableName ?? tableName;
    rowsSent = data.rowsReceived ?? rowsSent + rows.length;
    progress.chunksSent += 1;
    progress.rowsSent = rowsSent;
    options.onProgress?.(progress);

    audit.record({
      level: "ok",
      type: "upload.chunk.ack",
      message: `Chunk ${chunkIndex + 1}/${totalChunks} acknowledged (${rows.length} rows, complete=${isLastChunk})`,
      meta: {
        fileName,
        datasetId,
        chunkIndex,
        rowsInChunk: rows.length,
        rowsSent,
        complete: data.complete,
      },
    });

    if (data.complete) break;
  }

  update({
    state: "completed",
    datasetId,
    tableName,
    rowsSent,
  });
  return progress;
}
