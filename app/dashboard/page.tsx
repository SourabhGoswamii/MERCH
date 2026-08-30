"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Column = { original: string; name: string; type: string };
type SemanticContext = {
  entity?: string;
  description?: string;
  columns?: Record<string, string>;
};
type Insight = {
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  evidence?: string[];
  recommendedAction?: string;
};
type Dataset = {
  id: string;
  fileName: string;
  tableName: string;
  rowCount: number;
  columns: Column[];
  status: "UPLOADING" | "ANALYZING" | "READY" | "FAILED";
  error?: string | null;
  context?: { context: SemanticContext } | null;
};

const statusLabel: Record<Dataset["status"], string> = {
  UPLOADING: "Uploading",
  ANALYZING: "Understanding",
  READY: "Ready",
  FAILED: "Needs attention",
};

export default function DashboardPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentRequest, setAgentRequest] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);

  const loadDatasets = useCallback(async () => {
    try {
      const response = await fetch("/api/datasets", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load datasets");
      setDatasets(data.datasets);
      setSelectedId((current) =>
        current &&
        data.datasets.some((dataset: Dataset) => dataset.id === current)
          ? current
          : (data.datasets[0]?.id ?? null),
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDatasets(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDatasets]);
  useEffect(() => {
    if (
      !datasets.some(
        (dataset) =>
          dataset.status === "ANALYZING" || dataset.status === "UPLOADING",
      )
    )
      return;
    const timer = window.setInterval(() => void loadDatasets(), 5000);
    return () => window.clearInterval(timer);
  }, [datasets, loadDatasets]);

  const selected =
    datasets.find((dataset) => dataset.id === selectedId) ?? null;
  const readyDatasets = datasets.filter(
    (dataset) => dataset.status === "READY",
  );
  const totalRows = datasets.reduce(
    (total, dataset) => total + dataset.rowCount,
    0,
  );

  async function runAgent(mode: "initial_analysis" | "chat") {
    if (!readyDatasets.length || agentLoading) return;
    setAgentLoading(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          message: mode === "chat" ? agentRequest : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent request failed");
      setAgentMessage(data.response);
      setInsights(data.insights ?? []);
      if (mode === "chat") setAgentRequest("");
    } catch (error) {
      setAgentMessage(
        error instanceof Error ? error.message : "The agent could not run.",
      );
    } finally {
      setAgentLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        :root{--paper:#F5F3ED;--surface:#FBFAF6;--surface-2:#FDFCF8;--ink:#1F231D;--ink-2:#4E5349;--ink-3:#8B8F82;--line:#E2DED2;--line-2:#D2CDC0;--sage:#5F7355;--sage-deep:#33463A;--sage-mid:#8FA07E;--sage-pale:#E9EEDD;--ochre:#8A7440;--clay-deep:#9C5B33;--serif:'Fraunces',Georgia,serif;--sans:'Instrument Sans',sans-serif;--mono:'Spline Sans Mono',ui-monospace,monospace}
        body{background:var(--paper);font-family:var(--sans)} body::after{content:"";position:fixed;inset:0;z-index:200;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .12 0 0 0 0 .13 0 0 0 0 .10 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
        .serif{font-family:var(--serif)} .mono{font-family:var(--mono)}
      `,
        }}
      />

      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[rgba(245,243,237,.9)] px-6 backdrop-blur-md">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 border-0 bg-transparent text-[var(--sage-deep)] cursor-pointer"
        >
          <svg className="h-6 w-6" viewBox="0 0 26 26" aria-hidden="true">
            <circle
              cx="13"
              cy="13"
              r="11.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              opacity=".5"
            />
            <path
              d="M13 6.6 7.4 16.2M13 6.6l5.6 9.6M7.4 16.2h11.2"
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
              opacity=".8"
            />
            <circle cx="13" cy="6.6" r="2.1" fill="currentColor" />
            <circle cx="7.4" cy="16.2" r="2.1" fill="currentColor" />
            <circle cx="18.6" cy="16.2" r="2.1" fill="currentColor" />
          </svg>
          <span className="serif text-lg font-medium">MerchMind</span>
          <span className="mono text-[10px] tracking-[.14em] text-[var(--ink-3)]">
            / workspace
          </span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/upload")}
          className="rounded-full border border-[var(--line-2)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium transition hover:border-[var(--sage)] hover:bg-[var(--sage-pale)] cursor-pointer"
        >
          + Add data
        </button>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_290px]">
        <aside className="border-r border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="mono text-[11px] font-medium tracking-[.16em] text-[var(--ink-3)]">
            DATASETS
          </p>
          <div className="mt-5 space-y-2">
            {loading && (
              <p className="text-sm text-[var(--ink-3)]">Loading workspace…</p>
            )}
            {!loading && datasets.length === 0 && (
              <p className="text-sm text-[var(--ink-2)]">No datasets yet.</p>
            )}
            {datasets.map((dataset) => {
              const active = dataset.id === selectedId;
              return (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => setSelectedId(dataset.id)}
                  className={`w-full rounded-xl border p-3 text-left transition cursor-pointer ${active ? "border-[var(--line)] bg-[var(--sage-pale)]" : "border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-2)]"}`}
                >
                  <p className="mono truncate text-sm font-medium">
                    {dataset.fileName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {dataset.rowCount.toLocaleString()} rows ·{" "}
                    {dataset.columns.length} columns
                  </p>
                  <p
                    className={`mt-2 mono text-[10px] tracking-wide ${dataset.status === "FAILED" ? "text-[var(--clay-deep)]" : dataset.status === "READY" ? "text-[var(--sage-deep)]" : "text-[var(--ochre)]"}`}
                  >
                    {statusLabel[dataset.status]}
                  </p>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="mt-6 w-full rounded-xl border border-dashed border-[var(--line-2)] py-3 text-sm font-medium text-[var(--ink-2)] transition hover:border-[var(--sage)] hover:bg-[var(--surface-2)] hover:text-[var(--sage-deep)] cursor-pointer"
          >
            + Add CSV
          </button>
        </aside>

        <section className="min-w-0 p-6 sm:p-8">
          {datasets.length === 0 && !loading ? (
            <EmptyState onUpload={() => router.push("/upload")} />
          ) : (
            <>
              <p className="mono text-[11px] font-medium tracking-[.16em] text-[var(--ink-3)]">
                AI GROWTH STRATEGIST
              </p>
              <h1 className="serif mt-2 text-3xl">
                Your business, understood.
              </h1>
              <p className="mt-2 max-w-xl text-sm text-[var(--ink-2)]">
                Your data lives in one shared workspace. Uploads, dashboard
                context, and the future agent all read the same source of truth.
              </p>

              {selected && <DatasetWorkspace dataset={selected} />}
              <div className="mt-7 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="mono text-[11px] font-medium tracking-[.14em] text-[var(--ink-3)]">
                    MERCHMIND AGENT
                  </p>
                  <span className="mono text-[10px] tracking-wide text-[var(--sage-deep)]">
                    READ-ONLY
                  </span>
                </div>
                {agentMessage && (
                  <p className="mb-3 rounded-xl bg-[var(--sage-pale)] px-4 py-3 text-sm leading-6 text-[var(--ink-2)]">
                    {agentMessage}
                  </p>
                )}
                <div className="flex items-center gap-3 rounded-xl border border-[var(--line-2)] bg-[var(--surface-2)] p-2">
                  <input
                    value={agentRequest}
                    onChange={(event) => setAgentRequest(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void runAgent("chat");
                    }}
                    disabled={!readyDatasets.length || agentLoading}
                    placeholder={
                      readyDatasets.length
                        ? "Ask anything about your business…"
                        : "Your agent unlocks when a dataset is ready…"
                    }
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--ink-3)]"
                  />
                  <button
                    type="button"
                    onClick={() => void runAgent("chat")}
                    disabled={
                      !readyDatasets.length ||
                      !agentRequest.trim() ||
                      agentLoading
                    }
                    className="rounded-lg bg-[var(--sage-deep)] px-4 py-2 text-sm font-medium text-[#F4F2E9] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    {agentLoading ? "Thinking…" : "Ask"}
                  </button>
                </div>
                <p className="mono mt-3 text-center text-[10px] tracking-wide text-[var(--ink-3)]">
                  USES ANALYZED DATA + REGISTERED READ-ONLY TOOLS
                </p>
              </div>
            </>
          )}
        </section>

        <aside className="border-l border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="mono text-[11px] font-medium tracking-[.16em] text-[var(--ink-3)]">
            INTELLIGENCE
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Metric label="DATASETS" value={String(datasets.length)} />
            <Metric label="TOTAL ROWS" value={totalRows.toLocaleString()} />
            <Metric
              label="AI CONTEXT"
              value={`${readyDatasets.length}/${datasets.length} ready`}
              small
            />
          </div>
          <div className="mt-8 border-t border-[var(--line)] pt-6">
            <p className="mono text-[11px] font-medium tracking-[.16em] text-[var(--ink-3)]">
              TIPS & OPPORTUNITIES
            </p>
            {readyDatasets.length ? (
              <div className="mt-4 space-y-3">
                {insights.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--sage-mid)] bg-[var(--sage-pale)] p-4">
                    <p className="serif text-lg text-[var(--sage-deep)]">
                      Start your business analysis
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-2)]">
                      Let MerchMind use your configured tools to look for
                      sales-growth opportunities.
                    </p>
                    <button
                      type="button"
                      onClick={() => void runAgent("initial_analysis")}
                      disabled={agentLoading}
                      className="mt-4 rounded-full bg-[var(--sage-deep)] px-4 py-2 text-sm font-medium text-[#F4F2E9] disabled:opacity-40 cursor-pointer"
                    >
                      {agentLoading ? "Analyzing…" : "Start analysis →"}
                    </button>
                  </div>
                )}
                {insights.map((insight) => (
                  <div
                    key={insight.title}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="serif text-base">{insight.title}</p>
                      <span className="mono text-[9px] uppercase tracking-wide text-[var(--sage-deep)]">
                        {insight.confidence}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-2)]">
                      {insight.summary}
                    </p>
                    {insight.recommendedAction && (
                      <p className="mt-3 text-sm font-medium text-[var(--sage-deep)]">
                        → {insight.recommendedAction}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <p className="text-sm font-medium">
                  We’re getting things ready.
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-2)]">
                  MerchMind is reading the structure of your data. We will not
                  show made-up insights while that work is in progress.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function DatasetWorkspace({ dataset }: { dataset: Dataset }) {
  const context = dataset.context?.context;
  if (dataset.status === "ANALYZING" || dataset.status === "UPLOADING")
    return (
      <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <p className="mono text-[11px] tracking-[.14em] text-[var(--sage-deep)]">
          {statusLabel[dataset.status].toUpperCase()}
        </p>
        <h2 className="serif mt-3 text-2xl">
          We’re learning {dataset.fileName}.
        </h2>
        <p className="mt-3 text-sm text-[var(--ink-2)]">
          Your {dataset.rowCount.toLocaleString()} uploaded rows are safe in the
          workspace. Semantic understanding will appear here automatically.
        </p>
      </div>
    );
  if (dataset.status === "FAILED")
    return (
      <div className="mt-8 rounded-2xl border border-[#D8B8A3] bg-[#FBF4EF] p-6">
        <p className="serif text-2xl">This dataset needs attention.</p>
        <p className="mt-2 text-sm text-[var(--clay-deep)]">
          {dataset.error ?? "Analysis could not complete."}
        </p>
      </div>
    );
  return (
    <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <p className="mono text-[11px] tracking-[.14em] text-[var(--ink-3)]">
        DATASET UNDERSTANDING
      </p>
      <h2 className="serif mt-3 text-2xl">
        {context?.entity ?? dataset.fileName}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-2)]">
        {context?.description}
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {dataset.columns.map((column) => (
          <div
            key={column.name}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3"
          >
            <p className="mono text-xs font-medium">{column.name}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-2)]">
              {context?.columns?.[column.name] ??
                "Meaning will be available after analysis."}
            </p>
            <p className="mono mt-2 text-[10px] tracking-wide text-[var(--ink-3)]">
              {column.type}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-sm">
      <p className="mono text-[10px] tracking-wider text-[var(--ink-3)]">
        {label}
      </p>
      <p
        className={`${small ? "text-sm" : "text-2xl"} serif mt-2 text-[var(--sage-deep)]`}
      >
        {value}
      </p>
    </div>
  );
}
function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
      <p className="mono text-[11px] tracking-[.16em] text-[var(--sage-deep)]">
        WORKSPACE · STEP 01
      </p>
      <h1 className="serif mt-4 text-4xl">Let’s understand your business.</h1>
      <p className="mt-4 text-[var(--ink-2)]">
        Upload your first CSV to create a shared data workspace for the
        dashboard and your future AI growth agent.
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="mt-7 w-fit rounded-full bg-[var(--sage-deep)] px-6 py-3 text-sm font-medium text-[#F4F2E9] transition hover:bg-[#28392E] cursor-pointer"
      >
        Upload data →
      </button>
    </div>
  );
}
