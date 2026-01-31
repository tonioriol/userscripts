/**
 * Embed a trained logreg model JSON into `redditslopsleuth.user.js`.
 *
 * Input: a JSON file produced by `train/train-from-jsonl.js`:
 * {
 *   kind: "rss-logreg-binary-v1",
 *   model: { weights: {..}, bias: .. }
 * }
 *
 * Output: updates `RSS_V2_DEFAULT_MODEL` weights+bias.
 *
 * Usage:
 *   node train/embed-model-into-userscript.js --model ./train/model.json --userscript ./redditslopsleuth.user.js
 */

import fs from "node:fs";

const parseArgs = (argv) => {
  const args = { model: null, userscript: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--model") args.model = argv[i + 1];
    if (a === "--userscript") args.userscript = argv[i + 1];
  }
  return args;
};

const { model: modelPath, userscript: userscriptPath } = parseArgs(process.argv.slice(2));
if (!modelPath || !userscriptPath) {
  // eslint-disable-next-line no-console
  console.error("Usage: --model <train/model.json> --userscript <redditslopsleuth.user.js>");
  process.exit(2);
}

const modelJson = JSON.parse(fs.readFileSync(modelPath, "utf8"));
if (modelJson?.kind !== "rss-logreg-binary-v1" || !modelJson?.model?.weights) {
  // eslint-disable-next-line no-console
  console.error("Model JSON does not look like train/train-from-jsonl.js output (kind rss-logreg-binary-v1)");
  process.exit(2);
}

const next = {
  version: 1,
  kind: "logreg-binary",
  weights: modelJson.model.weights,
  bias: Number(modelJson.model.bias ?? 0) || 0,
};

const src = fs.readFileSync(userscriptPath, "utf8");

const marker = "const RSS_V2_DEFAULT_MODEL = ";
const idx = src.indexOf(marker);
if (idx < 0) {
  // eslint-disable-next-line no-console
  console.error("Could not find RSS_V2_DEFAULT_MODEL in userscript");
  process.exit(2);
}

// Find the opening brace after the marker.
const braceStart = src.indexOf("{", idx);
if (braceStart < 0) {
  // eslint-disable-next-line no-console
  console.error("Could not find opening { for RSS_V2_DEFAULT_MODEL");
  process.exit(2);
}

// Very small brace matcher to locate the end of the object literal.
let depth = 0;
let end = -1;
for (let i = braceStart; i < src.length; i += 1) {
  const ch = src[i];
  if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end < 0) {
  // eslint-disable-next-line no-console
  console.error("Could not find end of RSS_V2_DEFAULT_MODEL object literal");
  process.exit(2);
}

const before = src.slice(0, braceStart);
const after = src.slice(end);

const replacement = JSON.stringify(next, null, 2)
  // match file style (2-space indent already)
  .replace(/\n/g, "\n");

const out = `${before}${replacement}${after}`;
fs.writeFileSync(userscriptPath, out, "utf8");

// eslint-disable-next-line no-console
console.log(`Updated RSS_V2_DEFAULT_MODEL in ${userscriptPath} from ${modelPath}`);

