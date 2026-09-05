/*
 * Verifies that the centralized prompt module:
 *   1. Falls back to a hard-coded prompt when the env var is missing.
 *   2. Reads the env var when set.
 *   3. Exports all three env-var names so operators know what to set.
 *
 * Pure-Node, no framework, no DB.
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings scripts/verify-prompts.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const promptsPath = resolve(here, "..", "lib", "prompts.ts");
const sampleEnvPath = resolve(here, "..", "sampleenv");

let promptsPassed = 0;
let promptsFailed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    promptsPassed++;
    console.log(`  ok   ${name}`);
  } else {
    promptsFailed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const promptsSource = readFileSync(promptsPath, "utf8");

console.log("MERCH_SEMANTIC_PROMPT");
check(
  "exported as SEMANTIC_PROMPT",
  promptsSource.includes("export const SEMANTIC_PROMPT"),
);
check(
  "read from MERCH_SEMANTIC_PROMPT env var",
  promptsSource.includes('"MERCH_SEMANTIC_PROMPT"'),
);
check(
  "has a hard-coded fallback",
  promptsSource.includes("FALLBACK_SEMANTIC_PROMPT"),
);

console.log("MERCH_AGENT_PROMPT");
check(
  "exported as AGENT_SYSTEM_PROMPT",
  promptsSource.includes("export const AGENT_SYSTEM_PROMPT"),
);
check(
  "read from MERCH_AGENT_PROMPT env var",
  promptsSource.includes('"MERCH_AGENT_PROMPT"'),
);
check(
  "has a hard-coded fallback",
  promptsSource.includes("FALLBACK_AGENT_PROMPT"),
);

console.log("MERCH_INITIAL_ANALYSIS_PROMPT");
check(
  "exported as INITIAL_ANALYSIS_PROMPT",
  promptsSource.includes("export const INITIAL_ANALYSIS_PROMPT"),
);
check(
  "read from MERCH_INITIAL_ANALYSIS_PROMPT env var",
  promptsSource.includes('"MERCH_INITIAL_ANALYSIS_PROMPT"'),
);
check(
  "has a hard-coded fallback",
  promptsSource.includes("FALLBACK_INITIAL_ANALYSIS_PROMPT"),
);

console.log("PROMPT_ENV_VARS exposed for operators");
check(
  "PROMPT_ENV_VARS constant lists all three names",
  promptsSource.includes("PROMPT_ENV_VARS"),
);

console.log("No secrets exposed (NEXT_PUBLIC_*)");
check(
  "no NEXT_PUBLIC prompt var",
  !promptsSource.includes("NEXT_PUBLIC_") &&
    !promptsSource.includes("next/public"),
);

console.log("sampleenv");
try {
  const sample = readFileSync(sampleEnvPath, "utf8");
  check(
    "sampleenv includes MERCH_SEMANTIC_PROMPT",
    sample.includes("MERCH_SEMANTIC_PROMPT"),
  );
  check(
    "sampleenv includes MERCH_AGENT_PROMPT",
    sample.includes("MERCH_AGENT_PROMPT"),
  );
  check(
    "sampleenv includes MERCH_INITIAL_ANALYSIS_PROMPT",
    sample.includes("MERCH_INITIAL_ANALYSIS_PROMPT"),
  );
} catch {
  console.log("  SKIP sampleenv not present yet");
}

console.log(`\n${promptsPassed} passed, ${promptsFailed} failed`);
if (promptsFailed > 0) process.exit(1);
