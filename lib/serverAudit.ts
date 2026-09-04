import { promises as fs } from "node:fs";
import path from "node:path";

export type ServerAuditLevel = "info" | "ok" | "warn" | "error";

export type ServerAuditEvent = {
  ts: number;
  level: ServerAuditLevel;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
};

type Listener = (event: ServerAuditEvent) => void;

const channels = new Map<string, Set<Listener>>();

function channel(sessionId: string): Set<Listener> {
  let set = channels.get(sessionId);
  if (!set) {
    set = new Set();
    channels.set(sessionId, set);
  }
  return set;
}

export function subscribe(
  sessionId: string,
  listener: Listener,
): () => void {
  const set = channel(sessionId);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) channels.delete(sessionId);
  };
}

export function emit(
  sessionId: string,
  event: Omit<ServerAuditEvent, "ts">,
): void {
  const full: ServerAuditEvent = { ts: Date.now(), ...event };
  const set = channels.get(sessionId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(full);
    } catch {
      /* ignore */
    }
  }
}

export function defaultUploadTmpRoot(): string {
  if (
    process.env.UPLOAD_TMP_DIR &&
    process.env.UPLOAD_TMP_DIR.trim().length > 0
  ) {
    return process.env.UPLOAD_TMP_DIR;
  }

  /*
   * On serverless platforms (Vercel, AWS Lambda) the only writable
   * directory is the OS temp directory. process.cwd() resolves to a
   * read-only bundle path like /var/task, where mkdir fails with ENOENT.
   */
  const isServerless =
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.LAMBDA_TASK_ROOT;

  if (isServerless) {
    return path.join("/tmp", "uploads");
  }

  return path.join(process.cwd(), ".uploads");
}

export const UPLOAD_TMP_ROOT = defaultUploadTmpRoot();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function sessionDir(sessionId: string): string {
  if (!isValidSessionId(sessionId)) {
    throw new Error("Invalid session id");
  }
  const resolvedRoot = path.resolve(UPLOAD_TMP_ROOT);
  const resolved = path.resolve(resolvedRoot, sessionId);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error("Invalid session id");
  }
  return resolved;
}

export async function ensureSessionDir(sessionId: string): Promise<string> {
  const dir = sessionDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function sessionExists(sessionId: string): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false;
  try {
    await fs.access(path.join(sessionDir(sessionId), "meta.json"));
    return true;
  } catch {
    return false;
  }
}

export async function removeSessionDir(sessionId: string): Promise<void> {
  if (!isValidSessionId(sessionId)) return;
  const dir = sessionDir(sessionId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
