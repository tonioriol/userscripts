/**
 * Convert RSS-train-data JSONL into training JSONL.
 *
 * Input JSONL (one object per line):
 * {
 *   "kind": "rss-train-data",
 *   "url": "...",
 *   "username": "...",
 *   "text": "...",
 *   "features": { ... }
 * }
 *
 * Notes:
 * - This script is intentionally tolerant of DevTools console pastes that append
 *   " <filename>:<line>:<col>" after the JSON. We extract the first {...} blob.
 * - You can either:
 *   (A) assign a fixed label to all rows (e.g. treat as "human" negatives), or
 *   (B) pseudo-label with the current shipped model and confidence thresholds.
 *
 * Output JSONL (one object per line):
 * { "label": "human"|"ai", "features": { ... } }
 *
 * Usage:
 *   node train/label-rss-train-data-jsonl.js --in ./mydump.jsonl --out ./train.jsonl --label human
 *   node train/label-rss-train-data-jsonl.js --in ./mydump.jsonl --out ./train.jsonl --label model --ai-threshold 0.92 --human-threshold 0.10
 */

import fs from "node:fs";

// Side-effect import registers globalThis.__RSS_TRAIN__ when running under Node.
import "../redditslopsleuth.user.js";

const api = globalThis.__RSS_TRAIN__;
if (!api?.getDefaultModel) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing __RSS_TRAIN__.getDefaultModel; ensure Node is loading redditslopsleuth.user.js correctly",
  );
  process.exit(2);
}

const parseArgs = (argv) => {
  const args = {
    in: null,
    out: null,
    label: "human", // human|ai|model
    aiThreshold: 0.92,
    humanThreshold: 0.1,
    minWords: 6,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[i + 1];
    if (a === "--out") args.out = argv[i + 1];
    if (a === "--label") args.label = argv[i + 1];
    if (a === "--ai-threshold") args.aiThreshold = Number(argv[i + 1]);
    if (a === "--human-threshold") args.humanThreshold = Number(argv[i + 1]);
    if (a === "--min-words") args.minWords = Number(argv[i + 1]);
  }
  return args;
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const dot = (w, x) => {
  let s = 0;
  for (const k of Object.keys(w || {})) s += (w[k] || 0) * (x?.[k] || 0);
  return s;
};

const extractJsonObjectFromLine = (line) => {
  const s = String(line || "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j < 0 || j <= i) return null;
  try {
    return JSON.parse(s.slice(i, j + 1));
  } catch {
    return null;
  }
};

const approxWordCountFromFeatures = (features) => {
  const wc01 = Number(features?.wordCount || 0);
  // pickMlFeaturesFromText scales wordCount by /600.
  return Math.round(Math.max(0, wc01) * 600);
};

const looksLikeUiJunk = (text) => {
  const t = String(text || "");
  if (!t) return true;
  // New Reddit often includes "username • 5h ago" blocks when we fail to isolate the body.
  if (t.includes("\n•\n")) return true;
  if (/\b\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\s+ago\b/i.test(t))
    return true;
  if (/\b\d+\s+more\s+repl(?:y|ies)\b/i.test(t)) return true;
  if (t.trim() === "[deleted]" || t.trim() === "[removed]") return true;
  return false;
};

const normalizeFeatureNumbers = (featuresRaw) => {
  const out = {};
  const src =
    featuresRaw && typeof featuresRaw === "object" && !Array.isArray(featuresRaw)
      ? featuresRaw
      : {};
  for (const [k, v] of Object.entries(src)) {
    const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: --in <rss-train-data.jsonl> --out <train.jsonl> [--label human|ai|model]",
    );
    process.exit(2);
  }

  const labelMode = String(args.label || "human").toLowerCase();
  if (labelMode !== "human" && labelMode !== "ai" && labelMode !== "model") {
    // eslint-disable-next-line no-console
    console.error("--label must be one of: human | ai | model");
    process.exit(2);
  }

  const raw = fs.readFileSync(args.in, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const model = api.getDefaultModel();
  const aiT = Number.isFinite(args.aiThreshold) ? args.aiThreshold : 0.92;
  const humanT = Number.isFinite(args.humanThreshold) ? args.humanThreshold : 0.1;
  const minWords = Number.isFinite(args.minWords) ? args.minWords : 6;

  const out = [];
  let kept = 0;
  let skipped = 0;
  let ai = 0;
  let human = 0;

  for (const l of lines) {
    const row = extractJsonObjectFromLine(l);
    if (!row || row.kind !== "rss-train-data") {
      skipped += 1;
      continue;
    }

    const text = String(row.text || "");
    const features = normalizeFeatureNumbers(row.features);
    const words = approxWordCountFromFeatures(features);

    if (looksLikeUiJunk(text) || words < minWords) {
      skipped += 1;
      continue;
    }

    let label;
    if (labelMode === "human") label = "human";
    else if (labelMode === "ai") label = "ai";
    else {
      const p = sigmoid(dot(model.weights, features) + model.bias);
      if (p >= aiT) label = "ai";
      else if (p <= humanT) label = "human";
      else {
        skipped += 1;
        continue;
      }
    }

    kept += 1;
    if (label === "ai") ai += 1;
    if (label === "human") human += 1;
    out.push(JSON.stringify({ label, features }));
  }

  fs.writeFileSync(args.out, out.join("\n") + (out.length ? "\n" : ""), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${kept} rows (human ${human}, ai ${ai}), skipped ${skipped} (minWords=${minWords}, label=${labelMode}) to ${args.out}`,
  );
};

main();

