# Training (offline) – RedditSlopSleuth v2

The runtime userscript stays dependency-free.

Offline, we train a **tiny binary logistic regression** over engineered features extracted from [`buildTextFeatures()`](../redditslopsleuth.user.js:570).

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

The resulting [`train/model.json`](model.json:1) is intended to be embedded into [`redditslopsleuth.user.js`](../redditslopsleuth.user.js:1) as the shipped pretrained weights.

3) Embed the model into the userscript as the shipped default:

```bash
node train/embed-model-into-userscript.js --model ./train/model.json --userscript ./redditslopsleuth.user.js
```
