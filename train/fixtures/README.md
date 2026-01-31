# Training fixtures

- [`pretrain-raw.jsonl`](pretrain-raw.jsonl:1) is a tiny, synthetic dataset intended only for deterministic tests of the offline pipeline.
  - It is **not** used as real pretraining data.
  - It exists so CI can validate: featurize → train → embed output shape.

