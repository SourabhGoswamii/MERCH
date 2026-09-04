"use client";

import { useEffect, useMemo, useState } from "react";

import { audit, type AuditEvent, type AuditLevel } from "@/lib/audit";

const LEVEL_COLORS: Record<AuditLevel, string> = {
  info: "var(--ink-3)",
  ok: "var(--sage)",
  warn: "#B9834F",
  error: "var(--clay-deep)",
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function shortType(type: string): string {
  return type.replace(/_/g, " ").replace(/\./g, " · ");
}

export default function AuditLog() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "api" | "upload" | "agent">(
    "all",
  );

  useEffect(() => {
    audit.hydrate();
    const unsubscribe = audit.subscribe((next) => setEvents(next));
    const onNav = () => {
      audit.record({
        level: "info",
        type: "page.nav",
        message: `Navigated to ${window.location.pathname}`,
        meta: { path: window.location.pathname },
      });
    };
    onNav();
    return () => {
      unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "api") {
      return events.filter((e) => e.type.startsWith("api."));
    }
    if (filter === "upload") {
      return events.filter((e) => e.type.startsWith("upload."));
    }
    if (filter === "agent") {
      return events.filter(
        (e) =>
          e.type.startsWith("agent.") || e.type === "tool.execute",
      );
    }
    return events;
  }, [events, filter]);

  const counts = useMemo(() => {
    return {
      total: events.length,
      api: events.filter((e) => e.type.startsWith("api.")).length,
      upload: events.filter((e) => e.type.startsWith("upload.")).length,
      agent: events.filter(
        (e) =>
          e.type.startsWith("agent.") || e.type === "tool.execute",
      ).length,
      error: events.filter((e) => e.level === "error").length,
    };
  }, [events]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open audit log"
        title={`Audit log — ${events.length} events`}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 80,
          height: 36,
          padding: "0 14px",
          borderRadius: 999,
          border: "1px solid var(--line-2)",
          background: "rgba(251, 250, 246, 0.92)",
          backdropFilter: "blur(10px) saturate(1.1)",
          color: "var(--ink-2)",
          font: "500 12px/1 var(--mono)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          boxShadow: "0 8px 24px -10px rgba(31,35,29,.25)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: counts.error
              ? "var(--clay-deep)"
              : "var(--sage)",
            boxShadow: counts.error
              ? undefined
              : "0 0 0 0 rgba(95,115,85,.5)",
            animation: counts.error
              ? undefined
              : "audit-pulse 2.4s ease-out infinite",
          }}
        />
        Audit
        <span
          style={{
            background: "var(--ink)",
            color: "#F5F3ED",
            padding: "2px 7px",
            borderRadius: 999,
            fontSize: 10,
            letterSpacing: ".04em",
          }}
        >
          {events.length}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Audit log"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "min(420px, 100vw)",
            zIndex: 90,
            background: "var(--surface)",
            borderLeft: "1px solid var(--line)",
            boxShadow: "-20px 0 60px -20px rgba(31,35,29,.25)",
            display: "flex",
            flexDirection: "column",
            font: "400 13px/1.5 var(--sans)",
            color: "var(--ink)",
          }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `@keyframes audit-pulse {
                0% { box-shadow: 0 0 0 0 rgba(95,115,85,.5); }
                70% { box-shadow: 0 0 0 10px rgba(95,115,85,0); }
                100% { box-shadow: 0 0 0 0 rgba(95,115,85,0); }
              }
              .audit-row { transition: background .15s ease; }
              .audit-row:hover { background: rgba(31,35,29,.04); }
              .audit-scroller { scrollbar-width: thin; }
              .audit-scroller::-webkit-scrollbar { width: 6px; }
              .audit-scroller::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 3px; }`,
            }}
          />

          <div
            style={{
              padding: "16px 18px 12px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  font: "500 12px var(--mono)",
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                Audit log
              </p>
              <p
                style={{
                  font: "500 15px var(--serif)",
                  marginTop: 4,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {audit.getPage()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => audit.clear()}
              style={{
                font: "500 11px var(--mono)",
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                background: "transparent",
                border: "1px solid var(--line-2)",
                borderRadius: 999,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "1px solid var(--line-2)",
                background: "transparent",
                color: "var(--ink-2)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg
                viewBox="0 0 16 16"
                width={12}
                height={12}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              >
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "10px 14px",
              borderBottom: "1px solid var(--line)",
              flexWrap: "wrap",
            }}
          >
            {(
              [
                { id: "all", label: `All ${counts.total}` },
                { id: "api", label: `API ${counts.api}` },
                { id: "upload", label: `Upload ${counts.upload}` },
                { id: "agent", label: `Agent ${counts.agent}` },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                style={{
                  font: "500 10.5px var(--mono)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  padding: "6px 9px",
                  borderRadius: 999,
                  cursor: "pointer",
                  background:
                    filter === chip.id ? "var(--sage-pale)" : "transparent",
                  color:
                    filter === chip.id ? "var(--sage-deep)" : "var(--ink-2)",
                  border:
                    filter === chip.id
                      ? "1px solid var(--sage-mid)"
                      : "1px solid var(--line-2)",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div
            className="audit-scroller"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "6px 6px 12px",
            }}
          >
            {filtered.length === 0 && (
              <p
                style={{
                  padding: "20px 16px",
                  color: "var(--ink-3)",
                  font: "400 13px var(--sans)",
                }}
              >
                No events yet. Interact with the page to see API, upload, and
                agent events stream in.
              </p>
            )}
            {filtered.map((event) => (
              <div
                key={event.id}
                className="audit-row"
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  display: "grid",
                  gridTemplateColumns: "78px 1fr",
                  gap: 10,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    font: "400 10.5px var(--mono)",
                    color: "var(--ink-3)",
                    paddingTop: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTs(event.ts)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: LEVEL_COLORS[event.level],
                        flex: "none",
                      }}
                    />
                    <span
                      style={{
                        font: "500 10.5px var(--mono)",
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        color: "var(--ink-2)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {shortType(event.type)}
                    </span>
                  </div>
                  <p
                    style={{
                      marginTop: 2,
                      color: "var(--ink)",
                      fontSize: 12.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {event.message}
                  </p>
                  {event.meta && (
                    <AuditMeta meta={event.meta} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function AuditMeta({ meta }: { meta: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const keys = Object.keys(meta).filter(
    (k) =>
      k !== "requestId" &&
      k !== "error" &&
      meta[k] !== undefined &&
      meta[k] !== null,
  );
  if (keys.length === 0) return null;
  return (
    <details
      style={{ marginTop: 4 }}
      open={expanded}
      onToggle={(e) =>
        setExpanded((e.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          font: "400 10.5px var(--mono)",
          color: "var(--ink-3)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        {expanded ? "− details" : "+ details"}
      </summary>
      <pre
        style={{
          marginTop: 4,
          padding: "6px 8px",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          font: "400 11px var(--mono)",
          color: "var(--ink-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 160,
          overflow: "auto",
        }}
      >
        {JSON.stringify(
          Object.fromEntries(keys.map((k) => [k, meta[k]])),
          null,
          2,
        )}
      </pre>
    </details>
  );
}
