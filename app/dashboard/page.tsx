"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { runAgentStream } from "@/lib/agentClient";

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
      const data = await runAgentStream({
        mode,
        message: mode === "chat" ? agentRequest : undefined,
      });
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
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[rgba(245,243,237,.85)] px-6 backdrop-blur-md">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 border-0 bg-transparent text-[var(--sage-deep)] cursor-pointer"
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
            / workspace
          </span>
        </button>
        <div className="flex items-center gap-3">
          <span className="mono hidden text-[10.5px] tracking-[.14em] text-[var(--ink-3)] sm:inline">
            STEP 02 OF 03 · AI GROWTH
          </span>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="btn btn-primary btn-small cursor-pointer"
          >
            + Add data
          </button>
        </div>
      </header>

      <div className="dash-shell">
        <aside className="dash-rail-left" aria-label="Datasets">
          <div className="rail-head">
            <span className="rail-title">Datasets</span>
            <span className="rail-count">{datasets.length}</span>
          </div>

          {loading && (
            <p className="text-sm text-[var(--ink-3)]">Loading workspace…</p>
          )}
          {!loading && datasets.length === 0 && (
            <div
              className="rounded-lg border border-dashed border-[var(--line-2)] bg-[var(--surface-2)] p-4 text-sm text-[var(--ink-2)]"
              style={{ lineHeight: 1.55 }}
            >
              No datasets yet. Drop a CSV to get started.
            </div>
          )}

          <ul className="dataset-list">
            {datasets.map((dataset) => {
              const active = dataset.id === selectedId;
              const statusKey =
                dataset.status === "READY"
                  ? "ready"
                  : dataset.status === "FAILED"
                    ? "failed"
                    : "working";
              return (
                <li key={dataset.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(dataset.id)}
                    aria-current={active}
                    className="dataset-item"
                  >
                    <span className="name">{dataset.fileName}</span>
                    <span className="meta">
                      <span>{dataset.rowCount.toLocaleString()} rows</span>
                      <span className="sep" />
                      <span>{dataset.columns.length} cols</span>
                    </span>
                    <span className={`dataset-status ${statusKey}`}>
                      <span className="dot" aria-hidden="true" />
                      {statusLabel[dataset.status]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="add-csv"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Add CSV
          </button>
        </aside>

        <section className="dash-main">
          {datasets.length === 0 && !loading ? (
            <EmptyState onUpload={() => router.push("/upload")} />
          ) : (
            <>
              <div className="dash-hero">
                <p className="kicker">AI Growth Strategist</p>
                <h1 className="serif">
                  Your business, <em>understood</em>.
                </h1>
                <p>
                  Your data lives in one shared workspace. Uploads, dashboard
                  context, and the MerchMind agent all read the same source of
                  truth.
                </p>
              </div>

              {selected && <DatasetWorkspace dataset={selected} />}

              <div className="agent-card">
                <div className="flex items-center justify-between">
                  <p className="rail-title">MerchMind Agent</p>
                  <span className="mono text-[10px] tracking-[.14em] text-[var(--sage-deep)]">
                    READ-ONLY
                  </span>
                </div>
                {agentMessage && <p className="agent-reply">{agentMessage}</p>}
                <div className="agent-input">
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
                  />
                  <button
                    type="button"
                    onClick={() => void runAgent("chat")}
                    disabled={
                      !readyDatasets.length ||
                      !agentRequest.trim() ||
                      agentLoading
                    }
                    className="btn btn-primary btn-small cursor-pointer"
                  >
                    {agentLoading ? "Thinking…" : "Ask"}
                  </button>
                </div>
                <p className="mono text-center text-[10px] tracking-[.12em] text-[var(--ink-3)]">
                  USES ANALYZED DATA · REGISTERED READ-ONLY TOOLS
                </p>
              </div>
            </>
          )}
        </section>

        <aside className="dash-rail-right" aria-label="Intelligence">
          <div>
            <div className="rail-head">
              <span className="rail-title">This session</span>
              <span className="mono text-[10px] tracking-[.14em] text-[var(--ink-3)]">
                LIVE
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div className="metric-tile">
                <span className="lbl">Datasets</span>
                <span className="val">{datasets.length}</span>
              </div>
              <div className="metric-tile">
                <span className="lbl">Total rows</span>
                <span className="val">{totalRows.toLocaleString()}</span>
              </div>
              <div className="metric-tile">
                <span className="lbl">AI context</span>
                <span className="val small">
                  {readyDatasets.length}/{datasets.length} ready
                </span>
              </div>
            </div>
          </div>

          <div className="section-block">
            <span className="rail-title">Tips &amp; opportunities</span>
            {readyDatasets.length ? (
              <div className="flex flex-col gap-3">
                {insights.length === 0 && (
                  <div className="opp-card">
                    <h3>Start your business analysis</h3>
                    <p>
                      Let MerchMind use your configured tools to look for
                      sales-growth opportunities.
                    </p>
                    <button
                      type="button"
                      onClick={() => void runAgent("initial_analysis")}
                      disabled={agentLoading}
                      className="btn btn-primary btn-small cursor-pointer"
                      style={{ alignSelf: "flex-start" }}
                    >
                      {agentLoading ? "Analyzing…" : "Start analysis"}
                    </button>
                  </div>
                )}
                {insights.map((insight) => (
                  <article key={insight.title} className="insight">
                    <header>
                      <h4>{insight.title}</h4>
                      <span className="conf">{insight.confidence}</span>
                    </header>
                    <p>{insight.summary}</p>
                    {insight.recommendedAction && (
                      <p className="action">→ {insight.recommendedAction}</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="opp-card empty">
                <h3>We&apos;re getting things ready.</h3>
                <p>
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
      <div className="workspace-card">
        <span className="dataset-status working">
          <span className="dot" aria-hidden="true" />
          {statusLabel[dataset.status]}
        </span>
        <h2>We&apos;re learning {dataset.fileName}.</h2>
        <p className="lede">
          Your {dataset.rowCount.toLocaleString()} uploaded rows are safe in the
          workspace. Semantic understanding will appear here automatically.
        </p>
      </div>
    );
  if (dataset.status === "FAILED")
    return (
      <div className="banner error">
        <span className="rail-title" style={{ color: "var(--clay-deep)" }}>
          Needs attention
        </span>
        <h2>This dataset needs attention.</h2>
        <p className="error-text">{dataset.error ?? "Analysis could not complete."}</p>
      </div>
    );
  return (
    <div className="workspace-card">
      <span className="rail-title">Dataset understanding</span>
      <h2>{context?.entity ?? dataset.fileName}</h2>
      {context?.description && <p className="lede">{context.description}</p>}
      <div className="col-grid">
        {dataset.columns.map((column) => (
          <div key={column.name} className="col-cell">
            <span className="name">{column.name}</span>
            <span className="desc">
              {context?.columns?.[column.name] ??
                "Meaning will be available after analysis."}
            </span>
            <span className="type">{column.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="empty-dash">
      <p className="kicker">Workspace · Step 02</p>
      <h1 className="serif">
        Let&apos;s understand your <em>business</em>.
      </h1>
      <p>
        Upload your first CSV to create a shared data workspace for the
        dashboard and your future AI growth agent.
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="btn btn-primary cursor-pointer"
        style={{ marginTop: 8 }}
      >
        Upload data
      </button>
    </div>
  );
}
