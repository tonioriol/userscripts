/**
 * Minimal binary logistic regression with SGD + L2.
 *
 * - Designed for small/medium feature vectors (engineered features), not TF-IDF.
 * - Works with sparse objects: { featureName: numericValue }.
 *
 * Output model is tiny JSON (weights + bias), suitable to embed in
 * [`redditslopsleuth.user.js`](../redditslopsleuth.user.js:1).
 */

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export const dot = (w, x) => {
  let s = 0;
  for (const [k, v] of Object.entries(x)) {
    const vv = Number(v);
    if (!Number.isFinite(vv) || vv === 0) continue;
    s += (w[k] || 0) * vv;
  }
  return s;
};

export const predictProba = (model, x) => {
  const z = dot(model.weights, x) + (model.bias || 0);
  return sigmoid(z);
};

export const trainLogReg = (samples, opts = {}) => {
  const {
    epochs = 15,
    lr = 0.08,
    l2 = 1e-4,
    shuffle = true,
    seed = 1337,
  } = opts;

  const weights = Object.create(null);
  let bias = 0;

  // Simple deterministic RNG for shuffling.
  let rng = seed >>> 0;
  const rand = () => {
    // xorshift32
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) / 2 ** 32;
  };

  const data = samples.slice();

  for (let e = 0; e < epochs; e += 1) {
    if (shuffle) {
      for (let i = data.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = data[i];
        data[i] = data[j];
        data[j] = tmp;
      }
    }

    for (const s of data) {
      const y = s.y ? 1 : 0;
      const x = s.x || {};
      const sampleWeight = Number(s.w ?? s.weight ?? 1) || 1;
      if (!Number.isFinite(sampleWeight) || sampleWeight <= 0) continue;

      const p = predictProba({ weights, bias }, x);
      const err = p - y; // gradient of log-loss

      // Bias update.
      bias -= lr * sampleWeight * err;

      // Weight updates (sparse).
      for (const [k, v] of Object.entries(x)) {
        const vv = Number(v);
        if (!Number.isFinite(vv) || vv === 0) continue;
        const wk = weights[k] || 0;
        // L2 on weights (not bias)
        // Weighted logloss + unweighted L2:
        //   grad = w_i * err * x + l2 * w
        const grad = sampleWeight * err * vv + l2 * wk;
        weights[k] = wk - lr * grad;
      }
    }
  }

  return { weights, bias };
};

export const topWeights = (model, n = 25) => {
  const pairs = Object.entries(model.weights || {}).filter(([, v]) => Number.isFinite(v) && v !== 0);
  pairs.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return pairs.slice(0, n);
};
