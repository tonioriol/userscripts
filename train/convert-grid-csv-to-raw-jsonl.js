/**
 * Convert GRiD CSV -> raw text JSONL.
 *
 * GRiD repo notes (at time of writing) indicate CSV with columns:
 * - Data: text snippet
 * - Label: 0 (human) | 1 (GPT)
 *
 * Output JSONL format (one object per line):
 *   {"label":"human"|"ai","text":"..."}
 *
 * Usage:
 *   node train/convert-grid-csv-to-raw-jsonl.js --in ./grid.csv --out ./data/grid.raw.jsonl
 */

import fs from "node:fs";
import path from "node:path";

const parseArgs = (argv) => {
  const args = {
    in: null,
    out: null,
    textCol: "Data",
    labelCol: "Label",
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[i + 1];
    if (a === "--out") args.out = argv[i + 1];
    if (a === "--text-col") args.textCol = argv[i + 1] || args.textCol;
    if (a === "--label-col") args.labelCol = argv[i + 1] || args.labelCol;
    if (a === "--limit") args.limit = Number(argv[i + 1]);
  }
  return args;
};

const parseCsvLine = (line) => {
  // Minimal CSV parser: supports commas + quoted fields with escaped quotes.
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === ',') {
      out.push(cur);
      cur = "";
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
};

const { in: inPath, out: outPath, textCol, labelCol, limit } = parseArgs(process.argv.slice(2));
if (!inPath || !outPath) {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: --in <grid.csv> --out <raw.jsonl> [--text-col Data] [--label-col Label] [--limit N]"
  );
  process.exit(2);
}

const raw = fs.readFileSync(inPath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
if (!lines.length) {
  // eslint-disable-next-line no-console
  console.error("Empty CSV");
  process.exit(2);
}

const headers = parseCsvLine(lines[0]).map((h) => String(h || "").trim());
const idxText = headers.indexOf(textCol);
const idxLabel = headers.indexOf(labelCol);
if (idxText < 0 || idxLabel < 0) {
  // eslint-disable-next-line no-console
  console.error(`Missing required columns. Found: ${headers.join(", ")}`);
  process.exit(2);
}

const out = [];
let nHuman = 0;
let nAi = 0;

for (const line of lines.slice(1)) {
  const cols = parseCsvLine(line);
  const text = String(cols[idxText] ?? "").trim();
  const labelRaw = String(cols[idxLabel] ?? "").trim();
  if (!text) continue;

  const y = Number(labelRaw);
  const label = y === 1 ? "ai" : y === 0 ? "human" : null;
  if (!label) continue;

  out.push(JSON.stringify({ label, text }));
  if (label === "ai") nAi += 1;
  else nHuman += 1;

  if (Number.isFinite(limit) && limit !== null && out.length >= limit) break;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${out.length} rows to ${outPath} (human=${nHuman}, ai=${nAi})`);

