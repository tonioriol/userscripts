# RedditSlopSleuth v2 — Execution Plan

Definition of done
- All items in the workspace reminder list are marked completed.
- `npm test` is green.
- v2 can produce 🧠 hits in real browsing with explainability (top features) and without spammy false positives.
- A reproducible offline pipeline produces a tiny pretrained weights JSON and we embed it into the userscript.

Work plan (ordered)

## 1) Stabilize runtime scoring + features (finish v2 architecture)
1. Make v2 scoring truly “rolling per-user evidence” (2-pass recompute):
   - Pass 1: compute per-entry ML features + p(AI) (no profile fetch), aggregate per user.
   - Pass 2: compute final classification using final per-user mean, user priors, and optional profile.
   - Target: [`createRedditSlopSleuth()`](../redditslopsleuth.user.js:1387)

2. Feature families + caps + gating:
   - Define families: structure, repetition/templating, artifacts/spam, cadence/history.
   - Add caps to prevent one family dominating.
   - Gate language-dependent style signals (e.g. contractions) behind an “English-like” detector.
   - Target: [`buildTextFeatures()`](../redditslopsleuth.user.js:575) + rule set + ML feature picker.

3. History fetch integration:
   - Use `/overview.json` always (already done) + optional `/comments.json` + `/submitted.json` (now implemented behind `enableExtendedHistoryFetch`).
   - Add richer behavior features (burstiness, repeated templates, domain/sub diversity, recency ratios).
   - Keep strict caching, backoff, and quota.
   - Target: history helpers around [`getUserOverviewJson()`](../redditslopsleuth.user.js:1795)

## 2) Labeling workflow completeness
4. Finish label mode UX:
   - Import labels JSON.
   - Export labels/model JSON.
   - Keep per-user label priors.
   - Target: v2 drawer + popover ([`buildUi()`](../redditslopsleuth.user.js:1827))

5. Implement model versioning + rollback:
   - Keep a bounded history of model snapshots in localStorage.
   - Add “Undo last tune” action.

## 3) Evaluation / telemetry
6. Add evaluation panel:
   - Confusion matrix vs stored labels.
   - Precision/recall at threshold 0.5 and at the script’s operational thresholds.
   - Top weights + per-example top contributions already exist; expand as needed.

7. Extend tests:
   - History caching/quota behavior.
   - Import/export validation.
   - Fine-tune step + rollback.
   - Deterministic inference stability.

## 4) Offline pretraining end-to-end
8. Data prep scripts:
   - Accept JSONL input for GRiD/HC3 (document expected schema).
   - Featurize using the same userscript feature extractor.

9. Train + export weights:
   - Train logreg with SGD + L2.
   - Output a tiny model JSON with weights + bias.

10. Embed pretrained weights into userscript:
   - Add a small script to update [`RSS_V2_DEFAULT_MODEL`](../redditslopsleuth.user.js:1265) from a model JSON file.

## 5) Ship polish
11. Tune thresholds + reduce false positives.
12. Update README + attribution.
13. Version bump + conventional commits.

