/**
 * Convert an exported HC3-style JSON/JSONL file into raw text JSONL.
 *
 * HC3 on HuggingFace has multiple subsets; exports vary by tool.
 * This converter is intentionally tolerant and will look for common fields:
 * - human_answers: string[]
 * - chatgpt_answers: string[]
 *
 * Output JSONL format (one object per line):
 *   {"label":"human"|"ai","text":"..."}
 *
 * Usage:
 *   node train/convert-hc3-to-raw-jsonl.js --in ./hc3.json --out ./data/hc3.raw.jsonl
 */

import fs from "node:fs";
import path from "node:path";

const parseArgs = (argv) => {
  const args = {
    in: null,
    out: null,
    limit: null,
    maxPerRecord: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[i + 1];
    if (a === "--out") args.out = argv[i + 1];
    if (a === "--limit") args.limit = Number(argv[i + 1]);
    if (a === "--max-per-record") args.maxPerRecord = Number(argv[i + 1]);
  }
  return args;
};

const takeN = (arr, n) => {
  if (!Array.isArray(arr)) return [];
  if (!Number.isFinite(n) || n === null || n <= 0) return arr;
  return arr.slice(0, n);
};

const asTextArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x ?? "")).filter((s) => s.trim());
  if (typeof v === "string") return v.trim() ? [v] : [];
  return [];
};

const iterRecords = (rawText) => {
  const trimmed = rawText.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  }
  // JSONL
  return rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};

const { in: inPath, out: outPath, limit, maxPerRecord } = parseArgs(process.argv.slice(2));
if (!inPath || !outPath) {
  // eslint-disable-next-line no-console
  console.error("Usage: --in <hc3.json|jsonl> --out <raw.jsonl> [--limit N] [--max-per-record N]");
  process.exit(2);
}

const raw = fs.readFileSync(inPath, "utf8");
const records = iterRecords(raw);

const out = [];
let nHuman = 0;
let nAi = 0;

for (const r of records) {
  if (!r || typeof r !== "object") continue;

  // If it's already in our raw schema, pass it through.
  const existingLabel = String(r.label || "").toLowerCase();
  if ((existingLabel === "human" || existingLabel === "ai") && typeof r.text === "string") {
    const text = String(r.text || "").trim();
    if (!text) continue;
    out.push(JSON.stringify({ label: existingLabel, text }));
    if (existingLabel === "ai") nAi += 1;
    else nHuman += 1;
    if (Number.isFinite(limit) && limit !== null && out.length >= limit) break;
    continue;
  }

  const human = takeN(
    asTextArray(r.human_answers ?? r.humanAnswers ?? r.human ?? r.answers_human ?? r.answersHuman),
    maxPerRecord
  );
  const ai = takeN(
    asTextArray(r.chatgpt_answers ?? r.chatgptAnswers ?? r.chatgpt ?? r.answers_chatgpt ?? r.answersChatgpt),
    maxPerRecord
  );

  for (const text of human) {
    out.push(JSON.stringify({ label: "human", text }));
    nHuman += 1;
    if (Number.isFinite(limit) && limit !== null && out.length >= limit) break;
  }
  if (Number.isFinite(limit) && limit !== null && out.length >= limit) break;

  for (const text of ai) {
    out.push(JSON.stringify({ label: "ai", text }));
    nAi += 1;
    if (Number.isFinite(limit) && limit !== null && out.length >= limit) break;
  }
  if (Number.isFinite(limit) && limit !== null && out.length >= limit) break;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${out.length} rows to ${outPath} (human=${nHuman}, ai=${nAi})`);

