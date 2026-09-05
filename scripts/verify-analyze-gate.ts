/*
 * Standalone verification of the analyze-route READY gate.
 * Pure-Node, no framework, no DB. Mirrors the rule from
 * app/api/datasets/[id]/analyze/route.ts: only READY can be analyzed.
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings scripts/verify-analyze-gate.ts
 */

type DatasetStatus = "UPLOADING" | "ANALYZING" | "READY" | "FAILED";

type Outcome =
  | { kind: "rejected"; reason: string }
  | { kind: "noop" }
  | { kind: "run" };

function decide(
  status: DatasetStatus,
  force: boolean,
): Outcome {
  if (status === "UPLOADING") {
    return { kind: "rejected", reason: "Dataset upload is not complete yet" };
  }
  if (status === "FAILED") {
    return {
      kind: "rejected",
      reason: "Dataset is in a failed state and cannot be analyzed",
    };
  }
  if (status === "ANALYZING") {
    return { kind: "rejected", reason: "Analysis already in progress" };
  }
  if (status !== "READY") {
    return { kind: "rejected", reason: `Cannot analyze in status ${status}` };
  }
  if (!force) return { kind: "noop" };
  return { kind: "run" };
}

let gatePassed = 0;
let gateFailed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    gatePassed++;
    console.log(`  ok   ${name}`);
  } else {
    gateFailed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("UPLOADING");
{
  const r = decide("UPLOADING", false);
  check("rejected without force", r.kind === "rejected");
  const r2 = decide("UPLOADING", true);
  check("rejected even with force=true", r2.kind === "rejected");
}

console.log("FAILED");
{
  const r = decide("FAILED", false);
  check("rejected without force", r.kind === "rejected");
  const r2 = decide("FAILED", true);
  check("rejected even with force=true", r2.kind === "rejected");
}

console.log("ANALYZING");
{
  const r = decide("ANALYZING", false);
  check("rejected without force", r.kind === "rejected");
  const r2 = decide("ANALYZING", true);
  check("rejected even with force=true", r2.kind === "rejected");
}

console.log("READY");
{
  const r1 = decide("READY", false);
  check("noop when already analyzed (no force)", r1.kind === "noop");
  const r2 = decide("READY", true);
  check("run with force=true (re-analyse)", r2.kind === "run");
}

console.log(`\n${gatePassed} passed, ${gateFailed} failed`);
if (gateFailed > 0) process.exit(1);
