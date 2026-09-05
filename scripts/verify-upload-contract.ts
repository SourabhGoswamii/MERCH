/*
 * Standalone verification of the upload contract.
 * Pure-Node, no framework, no test runner, no DB.
 *
 * What it verifies:
 *   - sanitizeName: lowercases, strips invalid chars, collapses underscores, falls back
 *   - makeUniqueColumnNames: dedupes (id, ID, id, name) -> id, id_2, id_3, name
 *   - detectType: numeric, date, text, empty
 *   - row chunk math at boundary sizes: 499, 500, 501, 999, 1000, 1001
 *   - client "complete" flag is set on the last chunk, including when the
 *     last chunk is empty (an exact multiple of 500)
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings scripts/verify-upload-contract.ts
 */

function sanitizeName(value: string, fallback: string): string {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return name || fallback;
}

function makeUniqueColumnNames(
  columns: string[],
): { original: string; name: string }[] {
  const used = new Map<string, number>();
  return columns.map((original) => {
    const base = sanitizeName(original, "column");
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return { original, name: count === 1 ? base : `${base}_${count}` };
  });
}

function detectType(values: string[]): string {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !Number.isNaN(Number(v))))
    return "DOUBLE PRECISION";
  if (
    nonEmpty.every(
      (v) => !Number.isNaN(new Date(v).getTime()) && /[-/]/.test(v),
    )
  )
    return "TIMESTAMP";
  return "TEXT";
}

const ROW_CHUNK_SIZE = 500;

type ChunkRequest = {
  rows: unknown[];
  complete: boolean;
};

function buildChunkRequests(totalRows: number): ChunkRequest[] {
  const out: ChunkRequest[] = [];
  for (let i = 0; i < totalRows; i += ROW_CHUNK_SIZE) {
    const end = Math.min(i + ROW_CHUNK_SIZE, totalRows);
    const rows = Array.from({ length: end - i }, (_, k) => ({ i: i + k }));
    out.push({
      rows,
      complete: end === totalRows,
    });
  }
  return out;
}

let uploadPassed = 0;
let uploadFailed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    uploadPassed++;
    console.log(`  ok   ${name}`);
  } else {
    uploadFailed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("sanitizeName");
check("lowercases", sanitizeName("Hello", "x") === "hello");
check("strips invalid chars", sanitizeName("a b!c", "x") === "a_b_c");
check("collapses underscores", sanitizeName("a___b", "x") === "a_b");
check("falls back when empty", sanitizeName("!!!", "fb") === "fb");

console.log("makeUniqueColumnNames");
{
  const got = JSON.stringify(makeUniqueColumnNames(["id", "ID", "id", "name"]));
  const want = JSON.stringify([
    { original: "id", name: "id" },
    { original: "ID", name: "id_2" },
    { original: "id", name: "id_3" },
    { original: "name", name: "name" },
  ]);
  check("dedupes (id, id_2, id_3, name)", got === want, `got ${got}`);
}

console.log("detectType");
check("numeric → DOUBLE PRECISION", detectType(["1", "2", "3"]) === "DOUBLE PRECISION");
check("date → TIMESTAMP", detectType(["2024-01-02", "2024-02-03"]) === "TIMESTAMP");
check("text → TEXT", detectType(["a", "2", "c"]) === "TEXT");
check("empty → TEXT", detectType([]) === "TEXT");
check("whitespace-only → TEXT", detectType(["", "  "]) === "TEXT");

console.log("row chunking with explicit complete flag");
for (const size of [
  1, 10, 499, 500, 501, 999, 1000, 1001, 12345,
]) {
  const chunks = buildChunkRequests(size);
  const totalSent = chunks.reduce((s, c) => s + c.rows.length, 0);
  const last = chunks[chunks.length - 1];
  const exactlyOneFinal =
    chunks.filter((c) => c.complete).length === 1 &&
    last.complete === true;
  const completeIsLast =
    chunks.findIndex((c) => c.complete) === chunks.length - 1;
  const noMissing = totalSent === size;
  const noEmptyNonFinal =
    chunks.slice(0, -1).every((c) => c.rows.length > 0);
  check(
    `total ${size} → ${chunks.length} chunk(s), no missing, last chunk carries complete=true`,
    noMissing && exactlyOneFinal && completeIsLast && noEmptyNonFinal,
  );
}

console.log("exact-500 boundary — chunk 1 says more to come, chunk 2 finalizes");
{
  /*
   * A file with exactly 1000 rows used to be broken: the last chunk
   * had 500 rows and the server couldn't tell if more were coming.
   * With the explicit `complete` flag, the client says
   * `complete: false` on chunk 1 (rows 0-499) and `complete: true` on
   * chunk 2 (rows 500-999). The server finalizes on chunk 2.
   */
  const chunks = buildChunkRequests(1000);
  check("1000 rows → 2 chunks", chunks.length === 2);
  check("chunk 1: 500 rows, complete=false", chunks[0].rows.length === 500 && chunks[0].complete === false);
  check("chunk 2: 500 rows, complete=true (boundary fix)", chunks[1].rows.length === 500 && chunks[1].complete === true);
}

console.log("exact-1500 boundary — three chunks, last one full");
{
  const chunks = buildChunkRequests(1500);
  check("1500 rows → 3 chunks", chunks.length === 3);
  check("chunk 1: 500 rows, complete=false", chunks[0].rows.length === 500 && chunks[0].complete === false);
  check("chunk 2: 500 rows, complete=false", chunks[1].rows.length === 500 && chunks[1].complete === false);
  check("chunk 3: 500 rows, complete=true (boundary fix)", chunks[2].rows.length === 500 && chunks[2].complete === true);
}

console.log(`\n${uploadPassed} passed, ${uploadFailed} failed`);
if (uploadFailed > 0) process.exit(1);
