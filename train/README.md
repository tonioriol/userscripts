# Training (offline) – RedditSlopSleuth v2

The runtime userscript stays dependency-free.

Offline, we train a **tiny binary logistic regression** over engineered features extracted from [`buildTextFeatures()`](../redditslopsleuth.user.js:600).

## Data format

### Raw text JSONL

One JSON object per line:

```json
{"label":"human","text":"..."}
{"label":"ai","text":"..."}
```

### Featurized JSONL

Output format:

```json
{"label":"human","features":{...}}
{"label":"ai","features":{...}}
```

Optional fields:

- `weight` (number): per-sample weight used during SGD.
  - Supported by [`train/train-from-jsonl.js`](../train/train-from-jsonl.js:1) and [`train/trainLogReg()`](../train/logreg.js:28).

## Scripts

0) Convert public datasets into the raw JSONL schema.

- GRiD provides a CSV with columns like `Data` and `Label` (0 human, 1 GPT):

```bash
node train/convert-grid-csv-to-raw-jsonl.js --in ./data/grid.csv --out ./data/grid.raw.jsonl
```

- HC3 exports vary by tool; this converter accepts JSON or JSONL and looks for `human_answers[]` / `chatgpt_answers[]`:

```bash
node train/convert-hc3-to-raw-jsonl.js --in ./data/hc3.json --out ./data/hc3.raw.jsonl
```

1) Featurize raw JSONL into engineered feature vectors:

```bash
node train/featurize-text-jsonl.js --in ./data/raw.jsonl --out ./data/features.jsonl
```

2) Train a tiny model:

```bash
node train/train-from-jsonl.js --in ./data/features.jsonl --out ./train/model.json
```

### Training with real-browsing negatives (RSS-train-data)

If you collect `RSS-train-data` JSONL from the userscript UI, you can generate additional **human-negative** feature rows.
This is useful for reducing false positives on real Reddit text.

1) Convert RSS-train-data JSONL to training features:

```bash
node train/label-rss-train-data-jsonl.js --in ./train/local/rss-train-data.jsonl --out ./train/local/rss.human.features.jsonl --label human --min-words 8
```

2) Mix it with an AI-vs-human dataset (example: HC3 features) and (optionally) use weights:

```bash
# concatenate and train
cat ./data/hc3.features.jsonl ./train/local/rss.human.features.jsonl > ./data/hc3_plus_rss.features.jsonl
node train/train-from-jsonl.js --in ./data/hc3_plus_rss.features.jsonl --out ./train/model.json
```

If you want to upweight the real-browsing human negatives (to reduce false positives), add a `weight` field to those rows before training.
Example (weights RSS humans at 6x, leaves HC3 rows at 1x):

```bash
cat ./data/hc3.features.jsonl > ./data/hc3_plus_rss_weighted.features.jsonl
python3 - <<'PY'
import json
src = './train/local/rss.human.features.jsonl'
dst = './data/hc3_plus_rss_weighted.features.jsonl'
with open(src, 'r', encoding='utf-8') as f, open(dst, 'a', encoding='utf-8') as out:
  for line in f:
    line=line.strip()
    if not line: continue
    obj=json.loads(line)
    if obj.get('label') == 'human':
      obj['weight'] = 6
    out.write(json.dumps(obj, ensure_ascii=False) + '\n')
PY
node train/train-from-jsonl.js --in ./data/hc3_plus_rss_weighted.features.jsonl --out ./train/model.json
```

Notes:
- The repo ignores `train/model.json` by default; the shipped weights live in [`RSS_V2_DEFAULT_MODEL`](../redditslopsleuth.user.js:1365).

The resulting [`train/model.json`](model.json:1) is intended to be embedded into [`redditslopsleuth.user.js`](../redditslopsleuth.user.js:1) as the shipped pretrained weights.

3) Embed the model into the userscript as the shipped default:

```bash
node train/embed-model-into-userscript.js --model ./train/model.json --userscript ./redditslopsleuth.user.js
```
