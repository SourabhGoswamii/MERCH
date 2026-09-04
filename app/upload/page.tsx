"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { uploadCsvInChunks, type UploadProgress } from "@/lib/uploadClient";

type FileStatus = "pending" | "uploading" | "finalizing" | "completed" | "failed";

type QueueItem = {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  progress?: UploadProgress;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const updateItem = useCallback(
    (id: string, patch: (item: QueueItem) => QueueItem) => {
      setItems((current) =>
        current.map((it) => (it.id === id ? patch(it) : it)),
      );
    },
    [],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const next: QueueItem[] = Array.from(files)
        .filter((f) => f.name.toLowerCase().endsWith(".csv"))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "pending",
        }));
      if (next.length === 0) {
        setError("Please add .csv files only.");
        return;
      }
      setError(null);
      setItems((current) => [...current, ...next]);
      showToast(`${next.length} file(s) added.`);
    },
    [showToast],
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((current) => current.filter((it) => it.id !== id));
      showToast("Removed from queue.");
    },
    [showToast],
  );

  const startItem = useCallback(
    async (id: string) => {
      const item = items.find((it) => it.id === id);
      if (!item) return;
      setError(null);
      updateItem(id, (it) => ({ ...it, status: "uploading", error: undefined }));

      try {
        const final = await uploadCsvInChunks(item.file, {
          onProgress: (p) => {
            updateItem(id, (it) => ({
              ...it,
              status: p.state === "uploading"
                ? "uploading"
                : p.state === "finalizing"
                  ? "finalizing"
                  : it.status,
              progress: p,
            }));
          },
        });
        updateItem(id, (it) => ({
          ...it,
          status: "completed",
          progress: final,
        }));
        showToast(`${item.file.name} uploaded. AI understanding is in progress.`);
        if (final.datasetId) {
          void fetch(`/api/datasets/${final.datasetId}/analyze`, {
            method: "POST",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        updateItem(id, (it) => ({ ...it, status: "failed", error: message }));
        showToast(`Failed: ${item.file.name}`);
      }
    },
    [items, updateItem, showToast],
  );

  const startAll = useCallback(async () => {
    const pending = items.filter((it) => it.status === "pending");
    if (pending.length === 0) return;
    for (const it of pending) {
      await startItem(it.id);
    }
  }, [items, startItem]);

  const completedCount = items.filter((it) => it.status === "completed").length;
  const totalRows = items.reduce(
    (acc, it) => acc + (it.progress?.rowCount ?? 0),
    0,
  );

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[var(--line)] bg-[rgba(245,243,237,.85)] px-6 backdrop-blur-md">
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--sage-deep)] no-underline"
        >
          <svg className="h-6 w-6" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="11.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5" />
            <path d="M13 6.6 7.4 16.2M13 6.6l5.6 9.6M7.4 16.2h11.2" stroke="currentColor" strokeWidth="1.1" fill="none" opacity=".8" />
            <circle cx="13" cy="6.6" r="2.1" fill="currentColor" />
            <circle cx="7.4" cy="16.2" r="2.1" fill="currentColor" />
            <circle cx="18.6" cy="16.2" r="2.1" fill="currentColor" />
          </svg>
          <span className="serif text-lg font-medium">MerchMind</span>
          <span className="mono ml-2 text-[10px] tracking-[.14em] text-[var(--ink-3)]">
            / upload
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="mono hidden text-[10.5px] tracking-[.14em] text-[var(--ink-3)] sm:inline">
            STEP 01 OF 03 · WORKSPACE
          </span>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-full bg-[var(--sage-deep)] px-4 py-2 text-sm font-medium text-[#F4F2E9] transition hover:bg-[#28392E] cursor-pointer"
            >
              Open Dashboard
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="flex flex-col gap-2">
          <p className="kicker">Bring in your data</p>
          <h1 className="serif text-4xl leading-[1.08] tracking-[-0.01em] sm:text-[2.75rem]">
            Upload the <em>CSVs you already have</em>
          </h1>
          <p className="mt-1 max-w-2xl text-[var(--ink-2)]">
            Orders, customers, products — drop the exports you already trust.
            We stream them in chunks, and MerchMind starts reading as soon as
            the last byte lands.
          </p>
        </div>

        <div className="upload-shell mt-10">
          <div
            className="dropzone"
            role="button"
            tabIndex={0}
            aria-label="Drop CSV files here, or press Enter to browse"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.dataset.active = "true";
            }}
            onDragLeave={(e) => {
              e.currentTarget.dataset.active = "false";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.dataset.active = "false";
              if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
            }}
          >
            <div className="dropzone-grid" aria-hidden="true" />
            <div className="relative">
              <div className="dropzone-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
                  <path d="M4 16v2.5A2.5 2.5 0 006.5 21h11A2.5 2.5 0 0020 18.5V16" />
                </svg>
              </div>
              <p className="dropzone-title">
                Drop your <em>CSV files</em>
              </p>
              <p className="dropzone-sub">
                or click anywhere in this box to browse. Multiple files are fine — we&apos;ll queue them in order.
              </p>
              <p className="dropzone-meta">
                <span>.csv only</span>
                <span className="dot" />
                <span>Streamed in chunks</span>
                <span className="dot" />
                <span>Encrypted in transit</span>
              </p>
              <div className="dropzone-formats">
                <span className="tag tag-info">orders</span>
                <span className="tag tag-info">customers</span>
                <span className="tag tag-info">products</span>
                <span className="tag tag-info">inventory</span>
                <span className="tag tag-neutral">+ any tabular CSV</span>
              </div>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />

          <aside className="side-panel" aria-label="Upload summary">
            <div className="side-card">
              <div className="side-card-head">
                <span className="side-card-title">This session</span>
                <span className="mono text-[10.5px] tracking-[.12em] text-[var(--ink-3)]">
                  LIVE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="side-stat">
                  <span className="num">{items.length}</span>
                  <span className="lbl">files</span>
                </div>
                <div className="side-stat">
                  <span className="num">{completedCount}</span>
                  <span className="lbl">done</span>
                </div>
              </div>
              <div className="side-progress" aria-hidden="true">
                <i
                  style={{
                    width: `${
                      items.length === 0
                        ? 0
                        : Math.round((completedCount / items.length) * 100)
                    }%`,
                  }}
                />
              </div>
              <div className="side-row">
                <span>Rows ingested</span>
                <span className="v mono">{totalRows.toLocaleString()}</span>
              </div>
              <div className="side-row">
                <span>Failed</span>
                <span className="v mono">
                  {items.filter((it) => it.status === "failed").length}
                </span>
              </div>
              <div className="side-row">
                <span>Pending</span>
                <span className="v mono">
                  {items.filter((it) => it.status === "pending").length}
                </span>
              </div>
            </div>

            <div className="side-card" style={{ background: "var(--surface-2)" }}>
              <p className="side-card-title">What happens next</p>
              <ol className="mt-4 space-y-3 text-sm text-[var(--ink-2)]">
                <li className="flex gap-3">
                  <span className="mono mt-[2px] text-[10.5px] tracking-[.12em] text-[var(--ink-3)]">01</span>
                  <span>We stream each CSV in 5 MB chunks and verify the header row.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mono mt-[2px] text-[10.5px] tracking-[.12em] text-[var(--ink-3)]">02</span>
                  <span>MerchMind infers the schema, units, and joinable keys.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mono mt-[2px] text-[10.5px] tracking-[.12em] text-[var(--ink-3)]">03</span>
                  <span>The dataset appears in the dashboard, ready to query.</span>
                </li>
              </ol>
            </div>
          </aside>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-[#D8B8A3] bg-[#FBF4EF] px-4 py-3 text-sm text-[var(--clay-deep)]"
          >
            {error}
          </div>
        )}

        {items.length > 0 && (
          <div className="queue">
            <div className="queue-head">
              <div>
                <p className="side-card-title">Queue</p>
                <p className="serif mt-1 text-lg text-[var(--ink)]">
                  {items.length} file{items.length === 1 ? "" : "s"} · {completedCount} complete
                </p>
              </div>
              {items.some((it) => it.status === "pending") && (
                <button
                  type="button"
                  onClick={() => void startAll()}
                  className="btn btn-primary btn-small cursor-pointer"
                >
                  Upload all pending
                </button>
              )}
            </div>
            <ul className="queue-list">
              {items.map((it) => (
                <QueueRow
                  key={it.id}
                  item={it}
                  onStart={() => void startItem(it.id)}
                  onRemove={() => removeItem(it.id)}
                />
              ))}
            </ul>
            {completedCount > 0 && (
              <div className="queue-foot">
                <div>
                  <p className="summary-num">
                    {totalRows.toLocaleString()}{" "}
                    <span className="text-[var(--ink-2)]">rows</span>
                  </p>
                  <p className="summary-lbl">
                    across {completedCount} dataset{completedCount === 1 ? "" : "s"}
                  </p>
                  <p className="summary-note mt-2">
                    Open the audit log to watch each chunk land in real time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="btn btn-primary btn-small cursor-pointer"
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#242B22] px-5 py-2.5 text-sm text-[#F1EFE5] shadow-lg"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

function QueueRow({
  item,
  onStart,
  onRemove,
}: {
  item: QueueItem;
  onStart: () => void;
  onRemove: () => void;
}) {
  const { file, status, error, progress } = item;
  const pct =
    progress && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.bytesSent / progress.totalBytes) * 100))
      : 0;
  return (
    <li className="queue-row">
      <div className="file-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M3 1.5h6l3 3v9.5H3z" />
          <path d="M9 1.5V5h3" />
        </svg>
      </div>
      <div className="file-meta">
        <div className="flex items-baseline gap-3">
          <p className="file-name">{file.name}</p>
          <span className="mono text-[10.5px] text-[var(--ink-3)]">
            {formatBytes(file.size)}
          </span>
        </div>
        <div className="file-sub">
          {status === "pending" && <span>Ready to upload</span>}
          {status === "uploading" && (
            <>
              <span>Uploading</span>
              <span className="sep" />
              <span>chunk {progress?.chunksSent ?? 0}/{progress?.totalChunks ?? 0}</span>
              <span className="sep" />
              <span>{pct}%</span>
            </>
          )}
          {status === "finalizing" && <span>Assembling · analyzing</span>}
          {status === "completed" && (
            <span className="text-[var(--sage-deep)]">
              Uploaded
              {progress?.rowCount !== undefined && (
                <>
                  <span className="sep" />
                  <span>{progress.rowCount.toLocaleString()} rows</span>
                </>
              )}
            </span>
          )}
          {status === "failed" && (
            <span className="text-[var(--clay-deep)]">Failed</span>
          )}
        </div>
        {(status === "uploading" || status === "finalizing") && (
          <div className={status === "finalizing" ? "bar final" : "bar"}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        {status === "completed" && <div className="bar done"><i /></div>}
        {status === "failed" && <div className="bar failed"><i /></div>}
        {error && (
          <p className="mt-1.5 text-xs text-[var(--clay-deep)]">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {status === "pending" && (
          <>
            <button
              type="button"
              onClick={onStart}
              className="btn btn-primary btn-small cursor-pointer"
            >
              Upload
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-[var(--line-2)] bg-transparent text-[var(--ink-2)] transition hover:bg-[var(--surface-2)]"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </>
        )}
        {(status === "uploading" || status === "finalizing") && (
          <span className="spin-dot" aria-hidden="true" />
        )}
        {(status === "completed" || status === "failed") && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Dismiss"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-[var(--line-2)] bg-transparent text-[var(--ink-2)] transition hover:bg-[var(--surface-2)]"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}
