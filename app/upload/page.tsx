"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SemanticContext = {
  table?: string;
  entity?: string;
  description?: string;
  columns?: Record<string, string>;
  [key: string]: unknown;
};

type UploadFile = {
  id: string;
  file: File;
  status: "pending" | "processing" | "completed" | "failed";
  context?: SemanticContext;
  error?: string;
};

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [files, setFiles] = useState<UploadFile[]>([]);

  function handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return;

    const newFiles: UploadFile[] = Array.from(selectedFiles)
      .filter((file) =>
        file.name.toLowerCase().endsWith(".csv"),
      )
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "pending",
      }));

    setFiles((current) => [...current, ...newFiles]);
  }

  function removeFile(id: string) {
    setFiles((current) =>
      current.filter((file) => file.id !== id),
    );
  }

  async function confirmFile(id: string) {
    const item = files.find((file) => file.id === id);

    if (!item) return;

    setFiles((current) =>
      current.map((file) =>
        file.id === id
          ? {
              ...file,
              status: "processing",
              error: undefined,
            }
          : file,
      ),
    );

    try {
      const formData = new FormData();

      formData.append("files", item.file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to analyze file",
        );
      }

      const dataset = data.datasets?.[0];

      if (!dataset) {
        throw new Error(
          "No dataset was returned by the server",
        );
      }

      const semanticObject =
        dataset.semantic_object as SemanticContext;

      const savedDataset = {
        id: crypto.randomUUID(),
        table_name: dataset.table_name,
        file_name: dataset.file_name,
        row_count: dataset.row_count,
        columns: dataset.columns,
        semantic_object: semanticObject,
        created_at: new Date().toISOString(),
      };

      /*
       * Save the analyzed context locally for now.
       * Later this will be replaced by PostgreSQL JSONB persistence.
       */
      const existing = localStorage.getItem(
        "merchmind_datasets",
      );

      const datasets = existing
        ? JSON.parse(existing)
        : [];

      const filtered = datasets.filter(
        (dataset: {
          table_name: string;
        }) =>
          dataset.table_name !==
          savedDataset.table_name,
      );

      localStorage.setItem(
        "merchmind_datasets",
        JSON.stringify([
          ...filtered,
          savedDataset,
        ]),
      );

      console.log(
        "========== FILE ANALYZED ==========",
      );

      console.log(
        JSON.stringify(
          semanticObject,
          null,
          2,
        ),
      );

      console.log(
        "====================================",
      );

      setFiles((current) =>
        current.map((file) =>
          file.id === id
            ? {
                ...file,
                status: "completed",
                context: semanticObject,
              }
            : file,
        ),
      );
    } catch (error) {
      console.error(
        `Failed to analyze ${item.file.name}:`,
        error,
      );

      setFiles((current) =>
        current.map((file) =>
          file.id === id
            ? {
                ...file,
                status: "failed",
                error:
                  error instanceof Error
                    ? error.message
                    : "Analysis failed",
              }
            : file,
        ),
      );
    }
  }

  const completedFiles = files.filter(
    (file) => file.status === "completed",
  );

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium tracking-widest uppercase opacity-60">
              MerchMind
            </p>

            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              Upload your business data
            </h1>

            <p className="mt-3 max-w-xl opacity-60">
              Add your CSV files and confirm each one
              when you are ready to analyze it.
            </p>
          </div>

          {completedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-80"
            >
              Open Dashboard →
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 transition hover:border-white/50"
        >
          <span className="text-4xl">+</span>

          <span className="mt-3 font-medium">
            Add CSV files
          </span>

          <span className="mt-1 text-sm opacity-50">
            You can upload multiple files
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {files.length > 0 && (
          <div className="mt-8 space-y-4">
            {files.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/15 p-5"
              >
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.file.name}
                    </p>

                    <p className="mt-1 text-sm opacity-50">
                      {(item.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {item.status === "pending" && (
                      <>
                        <span className="text-sm opacity-60">
                          Ready to analyze
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            confirmFile(item.id)
                          }
                          className="rounded-lg bg-white px-4 py-2 text-sm text-black transition hover:opacity-80"
                        >
                          Confirm & Analyze
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeFile(item.id)
                          }
                          className="rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:bg-white hover:text-black"
                        >
                          Remove
                        </button>
                      </>
                    )}

                    {item.status === "processing" && (
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />

                        <span className="text-sm opacity-70">
                          Analyzing...
                        </span>
                      </div>
                    )}

                    {item.status === "completed" && (
                      <span className="text-sm">
                        ✓ Analyzed
                      </span>
                    )}

                    {item.status === "failed" && (
                      <span className="text-sm">
                        Analysis failed
                      </span>
                    )}
                  </div>
                </div>

                {item.status === "failed" &&
                  item.error && (
                    <p className="mt-3 text-sm opacity-60">
                      {item.error}
                    </p>
                  )}

                {item.status === "completed" &&
                  item.context && (
                    <div className="mt-4 rounded-xl bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-wider opacity-40">
                        AI Context
                      </p>

                      <p className="mt-2 font-medium">
                        {item.context.entity}
                      </p>

                      <p className="mt-1 text-sm opacity-60">
                        {item.context.description}
                      </p>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        {completedFiles.length > 0 && (
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-80"
            >
              Continue to Dashboard →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}