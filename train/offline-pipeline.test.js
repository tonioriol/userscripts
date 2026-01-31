import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { trainLogReg } from "./logreg.js";

// Side-effect import registers globalThis.__RSS_TRAIN__ when running under Node.
import "../redditslopsleuth.user.js";

const api = globalThis.__RSS_TRAIN__;

describe("train offline pipeline", () => {
  it("featurize -> train -> model payload shape", () => {
    expect(api?.pickMlFeaturesFromText).toBeTypeOf("function");

    const rawPath = path.join(process.cwd(), "train/fixtures/pretrain-raw.jsonl");
    const raw = fs.readFileSync(rawPath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const samples = [];
    for (const l of lines) {
      const obj = JSON.parse(l);
      const label = String(obj.label || "").toLowerCase();
      const y = label === "ai";
      const x = api.pickMlFeaturesFromText(String(obj.text || ""));
      samples.push({ x, y });
    }

    const model = trainLogReg(samples, {
      epochs: 10,
      lr: 0.06,
      l2: 1e-4,
      shuffle: true,
      seed: 1337,
    });

    expect(model).toBeTruthy();
    expect(model.weights).toBeTruthy();
    expect(typeof model.bias).toBe("number");

    // Basic sanity: at least one non-zero weight.
    const nonZero = Object.values(model.weights)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v !== 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it("embed script can replace RSS_V2_DEFAULT_MODEL object literal", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-pretrain-"));
    const userscriptSrc = fs.readFileSync(path.join(process.cwd(), "redditslopsleuth.user.js"), "utf8");

    const tmpUserscript = path.join(tmpDir, "redditslopsleuth.user.js");
    fs.writeFileSync(tmpUserscript, userscriptSrc, "utf8");

    // Create a minimal model payload like train/train-from-jsonl.js writes.
    const modelPayload = {
      kind: "rss-logreg-binary-v1",
      trainedAt: new Date(0).toISOString(),
      n: 10,
      classes: ["human", "ai"],
      model: { weights: { wordCount: 0.123 }, bias: -0.456 },
      top: [],
    };
    const tmpModel = path.join(tmpDir, "model.json");
    fs.writeFileSync(tmpModel, JSON.stringify(modelPayload, null, 2), "utf8");

    const res = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "train/embed-model-into-userscript.js"),
        "--model",
        tmpModel,
        "--userscript",
        tmpUserscript,
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(res.status).toBe(0);

    const nextSrc = fs.readFileSync(tmpUserscript, "utf8");
    expect(nextSrc).toContain("const RSS_V2_DEFAULT_MODEL");
    expect(nextSrc).toMatch(/"wordCount"\s*:\s*0\.123/);
    expect(nextSrc).toMatch(/"bias"\s*:\s*-0\.456/);
  });
});
