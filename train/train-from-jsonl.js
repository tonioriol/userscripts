/**
 * Train a tiny binary logistic regression model from JSONL.
 *
 * Input JSONL format (one object per line):
 * {
 *   "label": "human" | "ai",
 *   "features": { ... numeric feature map ... }
 * }
 *
 * Usage:
 *   node train/train-from-jsonl.js --in ./data/train.jsonl --out ./train/model.json
 */

import fs from "node:fs";
import path from "node:path";

import { trainLogReg, topWeights } from "./logreg.js";

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
if (!inPath) {
  // eslint-disable-next-line no-console
  console.error("Missing --in <path to jsonl>");
  process.exit(2);
}

const raw = fs.readFileSync(inPath, "utf8");
const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const samples = [];
for (const l of lines) {
  const obj = JSON.parse(l);
  const label = String(obj.label || "").toLowerCase();
  if (label !== "human" && label !== "ai") continue;
  const y = label === "ai";
  const x = obj.features || {};
  samples.push({ x, y });
}

if (samples.length < 10) {
  // eslint-disable-next-line no-console
  console.error(`Not enough samples: ${samples.length}`);
  process.exit(2);
}

const model = trainLogReg(samples, {
  epochs: 20,
  lr: 0.06,
  l2: 1e-4,
  shuffle: true,
  seed: 1337,
});

const payload = {
  kind: "rss-logreg-binary-v1",
  trainedAt: new Date().toISOString(),
  n: samples.length,
  classes: ["human", "ai"],
  model,
  top: topWeights(model, 40),
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
} else {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload, null, 2));
}
