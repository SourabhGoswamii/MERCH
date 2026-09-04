"use client";

import { audit, type AuditEvent } from "@/lib/audit";

export type UploadProgress = {
  fileName: string;
  totalBytes: number;
  totalChunks: number;
  chunksSent: number;
  bytesSent: number;
  state:
    | "idle"
    | "creating"
    | "uploading"
    | "finalizing"
    | "completed"
    | "failed";
  error?: string;
  datasetId?: string;
  tableName?: string;
  rowCount?: number;
};

export type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
  chunkSize?: number;
  maxConcurrentChunks?: number;
};

const DEFAULT_CHUNK_SIZE = 256 * 1024;
const DEFAULT_CONCURRENCY = 2;

export async function uploadCsvInChunks(
  file: File,
  options: UploadOptions = {},
): Promise<UploadProgress> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxConcurrentChunks =
    options.maxConcurrentChunks ?? DEFAULT_CONCURRENCY;

  const fileName = file.name;
  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));

  const progress: UploadProgress = {
    fileName,
    totalBytes,
    totalChunks,
    chunksSent: 0,
    bytesSent: 0,
    state: "creating",
  };

  const update = (patch: Partial<UploadProgress>) => {
    Object.assign(progress, patch);
    options.onProgress?.(progress);
  };

  audit.record({
    level: "info",
    type: "upload.session.create",
    message: `Requesting upload session for ${fileName} (${totalBytes} bytes, ${totalChunks} chunks)`,
    meta: { fileName, totalBytes, totalChunks, chunkSize },
  });

  let sessionId: string;
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, totalSize: totalBytes }),
    });
    const data = (await res.json()) as {
      success?: boolean;
      sessionId?: string;
      chunkSize?: number;
      error?: string;
    };
    if (!res.ok || !data.success || !data.sessionId) {
      throw new Error(data.error ?? "Failed to create upload session");
    }
    sessionId = data.sessionId;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start upload";
    update({ state: "failed", error: message });
    audit.record({
      level: "error",
      type: "upload.error",
      message: `Could not start upload of ${fileName}: ${message}`,
      meta: { fileName, error: message },
    });
    throw error;
  }

  update({ state: "uploading" });

  const queue: number[] = [];
  for (let i = 0; i < totalChunks; i++) queue.push(i);

  const sendOne = async (index: number) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, totalBytes);
    const blob = file.slice(start, end);
    const buf = await blob.arrayBuffer();

    audit.record({
      level: "info",
      type: "upload.chunk.start",
      message: `Sending chunk ${index + 1}/${totalChunks} (${buf.byteLength} bytes)`,
      meta: { sessionId, index, bytes: buf.byteLength },
    });

    let attempts = 0;
    const maxAttempts = 3;
    let lastError: unknown = null;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch(
          `/api/upload/${sessionId}/chunk?index=${index}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: buf,
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempts < maxAttempts) {
          const delay = 250 * attempts;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (lastError) {
      const message =
        lastError instanceof Error
          ? lastError.message
          : "Chunk upload failed";
      audit.record({
        level: "error",
        type: "upload.chunk.error",
        message: `Chunk ${index + 1}/${totalChunks} failed: ${message}`,
        meta: { sessionId, index, error: message },
      });
      throw new Error(message);
    }
    progress.chunksSent += 1;
    progress.bytesSent += buf.byteLength;
    options.onProgress?.(progress);
  };

  try {
    const workers: Promise<void>[] = [];
    for (
      let w = 0;
      w < Math.min(maxConcurrentChunks, totalChunks);
      w++
    ) {
      workers.push(
        (async () => {
          while (queue.length) {
            const next = queue.shift();
            if (next === undefined) return;
            await sendOne(next);
          }
        })(),
      );
    }
    await Promise.all(workers);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed";
    update({ state: "failed", error: message });
    audit.record({
      level: "error",
      type: "upload.error",
      message: `Upload failed for ${fileName}: ${message}`,
      meta: { sessionId, error: message },
    });
    throw error;
  }

  update({ state: "finalizing" });
  audit.record({
    level: "info",
    type: "upload.finalize",
    message: `Finalizing ${fileName} (assembling + analyzing)`,
    meta: { sessionId, fileName },
  });

  try {
    const res = await fetch(`/api/upload/${sessionId}/finalize`, {
      method: "POST",
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Finalize failed: ${res.status} ${txt}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult:
      | { type: "result"; data: Record<string, unknown> }
      | { type: "error"; error: string }
      | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line) as
            | ServerLine
            | { type: "result"; data: Record<string, unknown> }
            | { type: "error"; error: string };
          if ((evt as { type: string }).type === "result") {
            finalResult = evt as {
              type: "result";
              data: Record<string, unknown>;
            };
          } else if ((evt as { type: string }).type === "error") {
            finalResult = evt as { type: "error"; error: string };
          } else {
            const sl = evt as ServerLine;
            const level = (sl.level ?? "info") as AuditEvent["level"];
            audit.record({
              level,
              type: mapServerType(sl.type),
              message: sl.message ?? sl.type,
              meta: sl.meta,
            });
          }
        } catch {
          /* ignore malformed line */
        }
      }
    }

    if (finalResult && "error" in finalResult) {
      throw new Error(finalResult.error);
    }
    if (!finalResult || !("data" in finalResult)) {
      throw new Error("Finalize completed without a result");
    }
    const data = finalResult.data;
    update({
      state: "completed",
      datasetId: typeof data.datasetId === "string" ? data.datasetId : undefined,
      tableName: typeof data.tableName === "string" ? data.tableName : undefined,
      rowCount: typeof data.rowCount === "number" ? data.rowCount : undefined,
    });
    return progress;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Finalize failed";
    update({ state: "failed", error: message });
    audit.record({
      level: "error",
      type: "upload.error",
      message: `Finalize failed for ${fileName}: ${message}`,
      meta: { sessionId, error: message },
    });
    throw error;
  }
}

type ServerLine = {
  ts?: number;
  level?: "info" | "ok" | "warn" | "error";
  type: string;
  message?: string;
  meta?: Record<string, unknown>;
};

function mapServerType(type: string): AuditEvent["type"] {
  const allowed: AuditEvent["type"][] = [
    "page.nav",
    "page.load",
    "api.request",
    "api.response",
    "api.error",
    "upload.session.create",
    "upload.chunk.start",
    "upload.chunk.sent",
    "upload.chunk.ack",
    "upload.chunk.error",
    "upload.finalize",
    "upload.assembled",
    "upload.parsed",
    "upload.table.created",
    "upload.rows.inserted",
    "upload.complete",
    "upload.error",
    "analyze.request",
    "analyze.response",
    "analyze.error",
    "agent.start",
    "agent.tool.start",
    "agent.tool.end",
    "agent.tool.error",
    "agent.end",
    "agent.error",
    "tool.execute",
    "dataset.create",
    "warn",
    "error",
    "info",
  ];
  if ((allowed as string[]).includes(type)) {
    return type as AuditEvent["type"];
  }
  return "info";
}
