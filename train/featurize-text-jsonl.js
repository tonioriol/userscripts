/**
 * Featurize JSONL containing raw text into JSONL containing engineered features.
 *
 * Input JSONL format:
 * {
 *   "label": "human" | "ai",
 *   "text": "..."
 * }
 *
 * Output JSONL format:
 * {
 *   "label": "human" | "ai",
 *   "features": { ... }
 * }
 *
 * Usage:
 *   node train/featurize-text-jsonl.js --in ./data/raw.jsonl --out ./data/features.jsonl
 */

import fs from "node:fs";

// Side-effect import registers globalThis.__RSS_TRAIN__ when running under Node.
import "../redditslopsleuth.user.js";

const api = globalThis.__RSS_TRAIN__;
if (!api?.pickMlFeaturesFromText) {
  // eslint-disable-next-line no-console
  console.error("Missing __RSS_TRAIN__ API; ensure Node is loading redditslopsleuth.user.js correctly");
  process.exit(2);
}

const parseArgs = (argv) => {
  const args = { in: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[i + 1];
    if (a === "--out") args.out = argv[i + 1];
  }
  return args;
};

const { in: inPath, out: outPath } = parseArgs(process.argv.slice(2));
if (!inPath || !outPath) {
  // eslint-disable-next-line no-console
  console.error("Usage: --in <raw.jsonl> --out <features.jsonl>");
  process.exit(2);
}

const raw = fs.readFileSync(inPath, "utf8");
const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const out = [];
for (const l of lines) {
  const obj = JSON.parse(l);
  const label = String(obj.label || "").toLowerCase();
  if (label !== "human" && label !== "ai") continue;
  const text = String(obj.text || "");
  // Allow passing through precomputed feature vectors (e.g. from RSS-train-data export)
  // so we can train on history/context features that don't exist in raw datasets.
  const featuresRaw =
    obj.features && typeof obj.features === "object" && !Array.isArray(obj.features)
      ? obj.features
      : api.pickMlFeaturesFromText(text);

  // Normalize feature values to finite numbers.
  const features = {};
  for (const [k, v] of Object.entries(featuresRaw)) {
    const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
    features[k] = Number.isFinite(n) ? n : 0;
  }
  out.push(JSON.stringify({ label, features }));
}

fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");
