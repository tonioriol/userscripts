/**
 * Offline eval helper for RedditSlopSleuth v2.
 *
 * Computes accuracy/precision/recall at a given threshold (or sweeps thresholds)
 * over a raw JSONL dataset:
 *   {"label":"human"|"ai","text":"..."}
 *
 * Usage:
 *   node train/eval-jsonl.js --in ./data/grid.raw.jsonl --threshold 0.84
 *   node train/eval-jsonl.js --in ./data/hc3.raw.jsonl --sweep 0.5,0.6,0.7,0.78,0.84,0.9
 *
 * Notes:
 * - Uses the shipped model from redditslopsleuth.user.js (dependency-free runtime stays intact).
 * - Uses the same feature extractor as runtime.
 */

import fs from "node:fs";

// Side-effect import registers globalThis.__RSS_TRAIN__ when running under Node.
import "../redditslopsleuth.user.js";

const api = globalThis.__RSS_TRAIN__;
if (!api?.pickMlFeaturesFromText || !api?.getDefaultModel) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing __RSS_TRAIN__ API; ensure Node is loading redditslopsleuth.user.js correctly",
  );
  process.exit(2);
}

const parseArgs = (argv) => {
  const args = { in: null, threshold: null, sweep: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[i + 1];
    if (a === "--threshold") args.threshold = argv[i + 1];
    if (a === "--sweep") args.sweep = argv[i + 1];
  }
  return args;
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const dot = (w, x) => {
  let s = 0;
  for (const k of Object.keys(w)) s += (w[k] || 0) * (x[k] || 0);
  return s;
};

const pct = (x) => `${Math.round(x * 1000) / 10}%`;

const evalAt = (rows, model, t) => {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const r of rows) {
    const feats = api.pickMlFeaturesFromText(r.text);
    const p = sigmoid(dot(model.weights, feats) + model.bias);
    const predAi = p >= t;
    const yAi = r.label === "ai";

    if (predAi && yAi) tp += 1;
    else if (predAi && !yAi) fp += 1;
    else if (!predAi && !yAi) tn += 1;
    else fn += 1;
  }

  const acc = (tp + tn) / (tp + tn + fp + fn || 1);
  const prec = tp / (tp + fp || 1);
  const rec = tp / (tp + fn || 1);

  return { t, tp, fp, tn, fn, acc, prec, rec };
};

const { in: inPath, threshold, sweep } = parseArgs(process.argv.slice(2));
if (!inPath || (!threshold && !sweep)) {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: --in <raw.jsonl> (--threshold <t> | --sweep <t1,t2,...>)",
  );
  process.exit(2);
}

const raw = fs.readFileSync(inPath, "utf8");
const rows = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .map((r) => ({ label: String(r.label || "").toLowerCase(), text: String(r.text || "") }))
  .filter((r) => r.label === "human" || r.label === "ai");

const model = api.getDefaultModel();

if (threshold) {
  const t = Number(threshold);
  const r = evalAt(rows, model, t);
  // eslint-disable-next-line no-console
  console.log(
    `${inPath}: t=${t} acc ${pct(r.acc)} prec ${pct(r.prec)} rec ${pct(r.rec)} TP ${r.tp} FP ${r.fp} TN ${r.tn} FN ${r.fn}`,
  );
  process.exit(0);
}

const ts = String(sweep)
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

for (const t of ts) {
  const r = evalAt(rows, model, t);
  // eslint-disable-next-line no-console
  console.log(
    `${inPath}: t=${t} acc ${pct(r.acc)} prec ${pct(r.prec)} rec ${pct(r.rec)} TP ${r.tp} FP ${r.fp} TN ${r.tn} FN ${r.fn}`,
  );
}

