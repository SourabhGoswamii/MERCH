"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dataset = {
  id: string;
  table_name: string;
  file_name: string;
  row_count: number;
  columns: {
    original: string;
    name: string;
    type: string;
  }[];
  semantic_object: {
    table?: string;
    entity?: string;
    description?: string;
    columns?: Record<string, string>;
  };
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<Dataset | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("merchmind_datasets");

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      setDatasets(parsed);

      if (parsed.length > 0) {
        setSelected(parsed[0]);
      }
    } catch (error) {
      console.error("Failed to load datasets:", error);
    }
  }, []);

  const totalRows = datasets.reduce(
    (total, dataset) => total + dataset.row_count,
    0,
  );

  return (
    <main className="min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: `
        :root{
          --paper:#F5F3ED; --surface:#FBFAF6; --surface-2:#FDFCF8;
          --ink:#1F231D; --ink-2:#4E5349; --ink-3:#8B8F82;
          --line:#E2DED2; --line-2:#D2CDC0;
          --sage:#5F7355; --sage-deep:#33463A; --sage-mid:#8FA07E; --sage-pale:#E9EEDD;
          --ochre:#8A7440; --clay:#B9834F; --clay-deep:#9C5B33;
          --serif:'Fraunces',Georgia,serif; --sans:'Instrument Sans',sans-serif; --mono:'Spline Sans Mono',ui-monospace,monospace;
        }
        body{font:400 16px/1.6 var(--sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased}
        body::after{content:"";position:fixed;inset:0;z-index:200;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.13 0 0 0 0 0.10 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
        ::selection{background:#D8E0C8}
        :focus-visible{outline:2px solid #6B7F5C;outline-offset:2px;border-radius:4px}
        h1,h2,h3{font-family:var(--serif);font-weight:500;letter-spacing:-.015em;color:var(--ink)}
        button{font-family:var(--sans)}
        svg{display:block}
      `}} />

      <header className="flex h-16 items-center justify-between border-b border-[var(--line)] px-6 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-[var(--sage-deep)] text-sm font-medium tracking-wide bg-transparent border-none cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="11.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5"/>
            <path d="M13 6.6 7.4 16.2M13 6.6l5.6 9.6M7.4 16.2h11.2" stroke="currentColor" strokeWidth="1.1" fill="none" opacity=".8"/>
            <circle cx="13" cy="6.6" r="2.1" fill="currentColor"/><circle cx="7.4" cy="16.2" r="2.1" fill="currentColor"/><circle cx="18.6" cy="16.2" r="2.1" fill="currentColor"/>
          </svg>
          <span className="font-serif font-medium text-lg text-[var(--sage-deep)]">MerchMind</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="rounded-full border border-[var(--line-2)] px-4 py-2 text-sm text-[var(--ink)] bg-[var(--surface-2)] transition hover:border-[var(--sage)] hover:bg-[var(--sage-pale)] cursor-pointer font-medium"
          >
            + Add Data
          </button>

          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] transition cursor-pointer bg-transparent border border-transparent hover:border-[var(--line)]"
          >
            Settings
          </button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[260px_1fr_280px]">
        {/* LEFT */}
        <aside className="border-r border-[var(--line)] p-5 bg-[var(--surface)]">
          <div className="mb-6">
            <p className="text-[11px] font-[var(--mono)] font-medium tracking-[0.16em] uppercase text-[var(--ink-3)]">
              DATASETS
            </p>
          </div>

          {datasets.length === 0 ? (
            <div>
              <p className="text-sm text-[var(--ink-2)]">
                No datasets yet.
              </p>

              <button
                type="button"
                onClick={() => router.push("/upload")}
                className="mt-4 text-sm text-[var(--sage-deep)] underline underline-offset-4 font-medium bg-transparent border-none cursor-pointer"
              >
                Upload your first CSV
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {datasets.map((dataset) => {
                const active = selected?.id === dataset.id;

                return (
                  <button
                    key={dataset.id}
                    type="button"
                    onClick={() => setSelected(dataset)}
                    className={`w-full rounded-xl p-3 text-left transition border border-transparent cursor-pointer ${
                      active
                        ? "bg-[var(--sage-pale)] border-[var(--line)] text-[var(--sage-deep)] shadow-sm"
                        : "hover:bg-[var(--surface-2)] hover:border-[var(--line)] text-[var(--ink)]"
                    }`}
                  >
                    <p className="truncate text-sm font-medium font-mono">
                      {dataset.table_name}
                    </p>

                    <div className="mt-1 flex gap-2 text-xs text-[var(--ink-3)]">
                      <span>
                        {dataset.row_count.toLocaleString()} rows
                      </span>

                      <span>•</span>

                      <span>
                        {dataset.columns.length} cols
                      </span>
                    </div>

                    <p className="mt-1 truncate text-xs text-[var(--ink-3)]">
                      {dataset.semantic_object?.entity || "Dataset"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="mt-6 w-full rounded-xl border border-dashed border-[var(--line-2)] py-3 text-sm text-[var(--ink-2)] transition hover:border-[var(--sage)] hover:text-[var(--sage-deep)] hover:bg-[var(--surface-2)] cursor-pointer font-medium"
          >
            + Add CSV
          </button>
        </aside>

        {/* CENTER */}
        <section className="flex min-w-0 flex-col bg-[var(--paper)]">
          <div className="border-b border-[var(--line)] px-8 py-5 bg-[var(--surface)]">
            <p className="text-[11px] font-[var(--mono)] font-medium tracking-[0.16em] uppercase text-[var(--ink-3)]">
              AI STRATEGIST
            </p>

            <h1 className="mt-2 text-xl font-serif text-[var(--ink)]">
              Your business copilot
            </h1>

            <p className="mt-1 text-sm text-[var(--ink-2)]">
              Ask questions about your business data.
            </p>
          </div>

          <div className="flex flex-1 flex-col justify-between p-8">
            <div className="mx-auto w-full max-w-3xl">
              {datasets.length === 0 ? (
                <div className="flex min-h-96 items-center justify-center text-center">
                  <div>
                    <h2 className="text-2xl font-serif text-[var(--ink)]">
                      Let's understand your business.
                    </h2>

                    <p className="mt-3 text-sm text-[var(--ink-2)]">
                      Upload your CSV data to start
                      talking to MerchMind.
                    </p>

                    <button
                      type="button"
                      onClick={() => router.push("/upload")}
                      className="mt-6 rounded-full bg-[var(--sage-deep)] px-6 py-3 text-sm font-medium text-[#F4F2E9] transition hover:bg-[#28392E] cursor-pointer"
                    >
                      Upload Data
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                    <p className="text-xs font-[var(--mono)] tracking-wider text-[var(--sage-deep)] uppercase font-semibold">
                      MerchMind
                    </p>

                    <p className="mt-3 text-lg font-serif">
                      I now understand{" "}
                      <span className="font-semibold text-[var(--sage-deep)]">
                        {datasets.length}
                      </span>{" "}
                      dataset
                      {datasets.length !== 1 ? "s" : ""}.
                    </p>

                    <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">
                      Ask me about your sales,
                      customers, products,
                      transactions, trends, or
                      opportunities.
                    </p>
                  </div>

                  {selected && (
                    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] p-6">
                      <p className="text-[11px] uppercase font-[var(--mono)] tracking-[0.14em] text-[var(--ink-3)]">
                        Selected dataset
                      </p>

                      <h2 className="mt-3 text-xl font-serif text-[var(--ink)]">
                        {selected.table_name}
                      </h2>

                      <p className="mt-2 text-sm text-[var(--ink-2)] leading-relaxed">
                        {
                          selected
                            .semantic_object
                            ?.description
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CHAT INPUT */}
            <div className="mx-auto mt-8 w-full max-w-3xl">
              <div className="flex items-center rounded-2xl border border-[var(--line-2)] bg-[var(--surface)] p-2 shadow-sm focus-within:border-[var(--sage)]">
                <input
                  type="text"
                  placeholder="Ask anything about your business..."
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none text-[var(--ink)] placeholder:text-[var(--ink-3)]"
                  disabled={datasets.length === 0}
                />

                <button
                  type="button"
                  disabled={datasets.length === 0}
                  className="rounded-xl bg-[var(--sage-deep)] px-5 py-3 text-sm font-medium text-[#F4F2E9] transition hover:bg-[#28392E] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                >
                  Ask
                </button>
              </div>

              <p className="mt-2 text-center text-xs text-[var(--ink-3)] font-[var(--mono)]">
                AI responses will be connected to
                your data in the next step.
              </p>
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <aside className="border-l border-[var(--line)] p-5 bg-[var(--surface)]">
          <p className="text-[11px] font-[var(--mono)] font-medium tracking-[0.16em] uppercase text-[var(--ink-3)]">
            OVERVIEW
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-sm">
              <p className="text-[11px] font-[var(--mono)] text-[var(--ink-3)] tracking-wider">
                DATASETS
              </p>

              <p className="mt-2 text-2xl font-serif font-medium text-[var(--ink)]">
                {datasets.length}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-sm">
              <p className="text-[11px] font-[var(--mono)] text-[var(--ink-3)] tracking-wider">
                TOTAL ROWS
              </p>

              <p className="mt-2 text-2xl font-serif font-medium text-[var(--ink)]">
                {totalRows.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-sm">
              <p className="text-[11px] font-[var(--mono)] text-[var(--ink-3)] tracking-wider">
                AI CONTEXT
              </p>

              <p className="mt-2 text-sm font-medium text-[var(--sage-deep)]">
                {datasets.length > 0
                  ? "Ready"
                  : "Waiting for data"}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-[11px] font-[var(--mono)] font-medium tracking-[0.16em] uppercase text-[var(--ink-3)]">
              QUICK ACTIONS
            </p>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left text-sm text-[var(--ink-2)] transition hover:bg-[var(--sage-pale)] hover:border-[var(--sage)] hover:text-[var(--sage-deep)] cursor-pointer font-medium"
              >
                Analyze sales
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left text-sm text-[var(--ink-2)] transition hover:bg-[var(--sage-pale)] hover:border-[var(--sage)] hover:text-[var(--sage-deep)] cursor-pointer font-medium"
              >
                Find opportunities
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left text-sm text-[var(--ink-2)] transition hover:bg-[var(--sage-pale)] hover:border-[var(--sage)] hover:text-[var(--sage-deep)] cursor-pointer font-medium"
              >
                Understand customers
              </button>
            </div>
          </div>

          {selected && (
            <div className="mt-8">
              <p className="text-[11px] font-[var(--mono)] font-medium tracking-[0.16em] uppercase text-[var(--ink-3)]">
                SELECTED DATA
              </p>

              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-sm">
                <p className="text-sm font-medium font-mono text-[var(--ink)]">
                  {selected.file_name}
                </p>

                <p className="mt-2 text-xs text-[var(--ink-3)] font-[var(--mono)]">
                  {selected.row_count.toLocaleString()} rows
                </p>

                <p className="mt-1 text-xs text-[var(--ink-3)] font-[var(--mono)]">
                  {selected.columns.length} columns
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}