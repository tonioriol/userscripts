import { describe, it, expect } from "vitest";

import { trainLogReg, predictProba } from "./logreg.js";

describe("train/logreg", () => {
  it("learns a simple separable rule", () => {
    const samples = [];
    // Feature f1 strongly indicates AI.
    for (let i = 0; i < 50; i += 1) samples.push({ x: { f1: 1, biasish: 1 }, y: true });
    for (let i = 0; i < 50; i += 1) samples.push({ x: { f1: 0, biasish: 1 }, y: false });

    const model = trainLogReg(samples, { epochs: 25, lr: 0.1, l2: 1e-4, seed: 1 });
    const pAi = predictProba(model, { f1: 1, biasish: 1 });
    const pHuman = predictProba(model, { f1: 0, biasish: 1 });

    expect(pAi).toBeGreaterThan(0.8);
    expect(pHuman).toBeLessThan(0.2);
  });

  it("produces finite probabilities", () => {
    const model = trainLogReg(
      [
        { x: { a: 1 }, y: true },
        { x: { a: 0 }, y: false },
      ],
      { epochs: 3, lr: 0.1, l2: 0, shuffle: false }
    );
    const p = predictProba(model, { a: 1 });
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
