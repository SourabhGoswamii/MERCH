"use client";

import { useEffect, useRef } from "react";

import { audit } from "@/lib/audit";

type FetchInput = RequestInfo | URL;
type FetchInit = RequestInit & { skipAudit?: boolean };

const ORIGINAL_FETCH = typeof window === "undefined" ? null : window.fetch.bind(window);

function safeUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url ?? String(input);
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + (u.search ? `?${u.searchParams.toString().slice(0, 40)}` : "");
  } catch {
    return url;
  }
}

function inferMethod(init: RequestInit | undefined, fallback: string): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof fallback === "string" && /^(GET|POST|PUT|PATCH|DELETE)$/i.test(fallback)) {
    return fallback.toUpperCase();
  }
  return "GET";
}

let installed = false;
function ensureInstalled() {
  if (installed || typeof window === "undefined" || !ORIGINAL_FETCH) return;
  installed = true;
  window.fetch = async (input: FetchInput, init?: RequestInit) => {
    const skip = (init as FetchInit | undefined)?.skipAudit === true;
    const url = safeUrl(input);
    const method = inferMethod(init, url);
    const startedAt = performance.now();
    const requestId = crypto.randomUUID();

    if (!skip) {
      audit.record({
        level: "info",
        type: "api.request",
        message: `${method} ${shortUrl(url)}`,
        meta: { url, method, requestId },
      });
    }

    try {
      const response = await ORIGINAL_FETCH(input as RequestInfo, init);
      const durationMs = Math.round(performance.now() - startedAt);
      if (!skip) {
        audit.record({
          level: response.ok ? "ok" : "warn",
          type: "api.response",
          message: `${method} ${shortUrl(url)} → ${response.status}`,
          meta: {
            url,
            method,
            status: response.status,
            ok: response.ok,
            durationMs,
            requestId,
          },
        });
      }
      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      if (!skip) {
        audit.record({
          level: "error",
          type: "api.error",
          message: `${method} ${shortUrl(url)} failed`,
          meta: {
            url,
            method,
            durationMs,
            requestId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
      throw error;
    }
  };
}

export function useAuditFetch() {
  const ready = useRef(false);
  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    ensureInstalled();
  }, []);
}
