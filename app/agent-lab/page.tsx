"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  result?: unknown;
  error?: string;
};

async function runTool(
  tool: string,
  input: Record<string, unknown>,
) {
  const response = await fetch("/api/agent/tools", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tool,
      input,
    }),
  });

  return response.json();
}

export default function AgentLabPage() {
  const [results, setResults] = useState<
    Record<string, Result>
  >({});

  const [tableName, setTableName] = useState("");
  const [condition, setCondition] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [logTitle, setLogTitle] = useState(
    "Test insight",
  );

  const [logSummary, setLogSummary] = useState(
    "This is a test logbook entry.",
  );

  async function execute(
    name: string,
    input: Record<string, unknown>,
  ) {
    setResults((current) => ({
      ...current,
      [name]: {
        success: undefined,
        result: "Running...",
      },
    }));

    const result = await runTool(name, input);

    setResults((current) => ({
      ...current,
      [name]: result,
    }));
  }

  return (
    <main className="min-h-screen bg-[#F5F3ED] p-8 text-[#1F231D]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#6B7A5E]">
            MerchMind · Agent Lab
          </p>

          <h1 className="mt-3 text-4xl font-medium">
            Tool Playground
          </h1>

          <p className="mt-3 max-w-2xl text-[#4E5349]">
            Test every agent tool independently before
            connecting them to LangGraph.
          </p>
        </div>

        <div className="space-y-6">
          <ToolCard
            title="1. Dataset Context"
            description="Retrieve semantic understanding of available datasets."
            result={results.get_dataset_context}
          >
            <button
              onClick={() =>
                execute("get_dataset_context", {})
              }
            >
              Get Dataset Context
            </button>
          </ToolCard>

          <ToolCard
            title="2. Query Dataset"
            description="Query actual rows from a dataset."
            result={results.query_dataset}
          >
            <input
              value={tableName}
              onChange={(e) =>
                setTableName(e.target.value)
              }
              placeholder="table name"
            />

            <input
              value={condition}
              onChange={(e) =>
                setCondition(e.target.value)
              }
              placeholder="condition e.g. amount > 500"
            />

            <button
              onClick={() =>
                execute("query_dataset", {
                  tableName,
                  condition:
                    condition.trim() || undefined,
                  limit: 20,
                })
              }
            >
              Query Dataset
            </button>
          </ToolCard>

          <ToolCard
            title="3. Web Search"
            description="Search external information."
            result={results.web_search}
          >
            <input
              value={searchQuery}
              onChange={(e) =>
                setSearchQuery(e.target.value)
              }
              placeholder="Search query"
            />

            <button
              onClick={() =>
                execute("web_search", {
                  query: searchQuery,
                })
              }
            >
              Search Web
            </button>
          </ToolCard>

          <ToolCard
            title="4. Get Logbook"
            description="Read historical business memory."
            result={results.get_logbook}
          >
            <button
              onClick={() =>
                execute("get_logbook", {})
              }
            >
              Get Logbook
            </button>
          </ToolCard>

          <ToolCard
            title="5. Write Logbook"
            description="Create a persistent business memory entry."
            result={results.write_logbook}
          >
            <input
              value={logTitle}
              onChange={(e) =>
                setLogTitle(e.target.value)
              }
              placeholder="Title"
            />

            <input
              value={logSummary}
              onChange={(e) =>
                setLogSummary(e.target.value)
              }
              placeholder="Summary"
            />

            <button
              onClick={() =>
                execute("write_logbook", {
                  type: "INSIGHT",
                  title: logTitle,
                  summary: logSummary,
                  evidence: {
                    source: "Agent Lab",
                  },
                })
              }
            >
              Write Logbook
            </button>
          </ToolCard>
        </div>
      </div>
    </main>
  );
}

function ToolCard({
  title,
  description,
  result,
  children,
}: {
  title: string;
  description: string;
  result?: Result;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E2DED2] bg-[#FBFAF6] p-6">
      <h2 className="text-xl font-medium">{title}</h2>

      <p className="mt-1 text-sm text-[#6B7067]">
        {description}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {children}
      </div>

      {result && (
        <pre className="mt-5 max-h-[500px] overflow-auto rounded-xl bg-[#242B22] p-5 text-xs text-[#F1EFE5]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}