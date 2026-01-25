// ==UserScript==
// @name         RedditSlopSleuth
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.1.16
// @description  Heuristic bot/AI slop indicator for Reddit with per-user badges and a details side panel.
// @author       Toni Oriol
// @match        *://www.reddit.com/*
// @match        *://old.reddit.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @grant        GM_addStyle
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/redditslopsleuth.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/redditslopsleuth.user.js
// ==/UserScript==

(() => {
  "use strict";

  /**
   * Clean-room implementation.
   * - No external CSS dependencies; styles are a small Tailwind-like utility subset.
   * - Optional Reddit profile fetch (`/user/<name>/about.json`) with caching + rate limiting.
   * - Badges are injected next to usernames; clicking shows a right-side panel.
   */
  const UI_ROOT_ID = "rss-root";
  const BADGE_ATTR = "data-rss-badge";
  const PROCESSED_ATTR = "data-rss-processed";
  const ENTRY_ID_ATTR = "data-rss-entry-id";

  // Best-effort mode: always use all available signals.
  // - Always fetch profile JSON (cached + rate-limited)
  // - Always show human badges

  const HARD_CODED_THRESHOLDS = {
    bot: 7,
    ai: 6,
    human: -2,
  };

  const PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const PROFILE_FAILURE_TTL_MS = 15 * 60 * 1000;
  const PROFILE_MIN_INTERVAL_MS = 1200;
  const PROFILE_STORAGE_PREFIX = "rss-profile:";

  const SELECTORS = {
    // Broad containers for both new and old Reddit.
    content: [
      "article",
      // New Reddit (web components)
      "shreddit-post",
      "shreddit-comment",
      "shreddit-comment-tree",
      // New Reddit feed credit bar (sometimes the only light-DOM post metadata we can see)
      'span[slot="credit-bar"]',
      'span[id^="feed-post-credit-bar-"]',
      'div[data-testid="comment"]',
      'div[data-testid="post-container"]',
      "div.comment",
      "div.link",
    ],
    username: [
      // Newer Reddit variants
      'a[data-testid="comment_author_link"]',
      'a[data-testid="post_author_link"]',
      'a[data-testid$="_author_link"]',
      // Old Reddit
      "a.author",
      // Some Reddit variants
      'a[data-click-id="user"]',
      // Fallbacks (filtered to avoid user mentions inside body text)
      'a[href^="/user/"]',
      'a[href^="/u/"]',
      'a[href*="/user/"]',
      'a[href*="/u/"]',
    ],
    text: [
      "div.md",
      "div.usertext-body",
      "div[data-click-id=\"text\"]",
      "div[data-testid=\"comment\"]",
    ],
  };

  const uiCss = () => {
    // Small Tailwind-like utility subset + component styles. All classnames are prefixed `rss-`.
    return `
      :root {
        --rss-z: 2147483646;
        --rss-bg: rgba(255,255,255,0.92);
        --rss-border: rgba(0,0,0,0.12);
        --rss-shadow: 0 12px 32px rgba(0,0,0,0.25);
        --rss-text: #111827;
        --rss-muted: #6b7280;
        --rss-blue: #2563eb;
        --rss-red: #dc2626;
        --rss-purple: #7c3aed;
        --rss-green: #16a34a;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --rss-bg: rgba(17,24,39,0.92);
          --rss-border: rgba(255,255,255,0.14);
          --rss-shadow: 0 12px 32px rgba(0,0,0,0.55);
          --rss-text: #f9fafb;
          --rss-muted: #9ca3af;
        }
      }

      /* Utilities */
      .rss-fixed { position: fixed; }
      .rss-absolute { position: absolute; }
      .rss-inset-0 { inset: 0; }
      .rss-right-0 { right: 0; }
      .rss-top-0 { top: 0; }
      .rss-bottom-4 { bottom: 1rem; }
      .rss-right-4 { right: 1rem; }
      .rss-flex { display: flex; }
      .rss-flex-col { flex-direction: column; }
      .rss-items-center { align-items: center; }
      .rss-justify-between { justify-content: space-between; }
      .rss-gap-2 { gap: 0.5rem; }
      .rss-gap-3 { gap: 0.75rem; }
      .rss-p-3 { padding: 0.75rem; }
      .rss-p-4 { padding: 1rem; }
      .rss-px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
      .rss-py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
      .rss-rounded { border-radius: 0.5rem; }
      .rss-rounded-full { border-radius: 9999px; }
      .rss-border { border: 1px solid var(--rss-border); }
      .rss-shadow { box-shadow: var(--rss-shadow); }
      .rss-text-sm { font-size: 12px; }
      .rss-text-base { font-size: 14px; }
      .rss-font-semibold { font-weight: 600; }
      .rss-font-bold { font-weight: 700; }
      .rss-muted { color: var(--rss-muted); }
      .rss-bg { background: var(--rss-bg); }
      .rss-bg-solid { background: #fff; }
      .rss-w-96 { width: 24rem; }
      .rss-max-h-80vh { max-height: 80vh; }
      .rss-overflow-auto { overflow: auto; }
      .rss-select-none { user-select: none; }
      .rss-cursor-pointer { cursor: pointer; }
      .rss-hover-bg:hover { background: rgba(0,0,0,0.06); }
      .rss-focus-ring:focus { outline: 2px solid var(--rss-blue); outline-offset: 2px; }

      /* Badge */
      .rss-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;
        width: 20px;
        height: 20px;
        border-radius: 9999px;
        border: 1px solid var(--rss-border);
        background: rgba(255,255,255,0.85);
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        flex: 0 0 auto;
        flex-shrink: 0;
        position: relative;
        z-index: var(--rss-z);
      }

      .rss-badge[data-rss-kind="bot"] { border-color: rgba(220, 38, 38, 0.35); }
      .rss-badge[data-rss-kind="ai"] { border-color: rgba(124, 58, 237, 0.35); }
      .rss-badge[data-rss-kind="human"] { border-color: rgba(22, 163, 74, 0.35); }

      /* Drawer */
      #${UI_ROOT_ID} { position: fixed; z-index: var(--rss-z); }
      .rss-gear {
        width: 44px;
        height: 44px;
        border-radius: 9999px;
        border: 1px solid var(--rss-border);
        background: var(--rss-bg);
        box-shadow: var(--rss-shadow);
        color: var(--rss-text);
        font-size: 18px;
      }

      .rss-overlay {
        background: rgba(0,0,0,0.30);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }

      .rss-drawer {
        height: 100vh;
        background: var(--rss-bg);
        border-left: 1px solid var(--rss-border);
        box-shadow: var(--rss-shadow);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: var(--rss-text);
      }

      .rss-row {
        border: 1px solid var(--rss-border);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        background: rgba(255,255,255,0.6);
      }

      .rss-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--rss-border);
        border-radius: 9999px;
        padding: 4px 8px;
        font-size: 12px;
        background: rgba(255,255,255,0.7);
      }

      @media (prefers-color-scheme: dark) {
        .rss-pill { background: rgba(17,24,39,0.55); }
        .rss-row { background: rgba(17,24,39,0.55); }
        .rss-badge { background: rgba(17,24,39,0.75); }
        .rss-popover { background: rgba(17,24,39,0.96); }
      }

      /* Meters */
      .rss-meters { display: flex; flex-direction: column; gap: 10px; }
      .rss-meter-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
        color: var(--rss-muted);
      }
      .rss-meter-track {
        position: relative;
        height: 8px;
        border-radius: 9999px;
        border: 1px solid var(--rss-border);
        background: rgba(0,0,0,0.08);
        overflow: hidden;
      }
      .rss-meter-fill {
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: var(--rss-blue);
      }
      .rss-meter-fill[data-rss-meter="bot"] { background: var(--rss-red); }
      .rss-meter-fill[data-rss-meter="ai"] { background: var(--rss-purple); }
      .rss-meter-fill[data-rss-meter="overall"] { background: var(--rss-blue); }

      .rss-btn {
        border: 1px solid var(--rss-border);
        border-radius: 0.5rem;
        padding: 8px 10px;
        background: rgba(255,255,255,0.8);
        cursor: pointer;
      }
      .rss-btn:hover { background: rgba(255,255,255,1); }
      .rss-btn-primary { border-color: rgba(37, 99, 235, 0.35); }

      .rss-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .rss-why {
        margin: 0;
        padding-left: 16px;
        color: var(--rss-muted);
      }

      .rss-tooltip {
        position: fixed;
        z-index: var(--rss-z);
        max-width: 320px;
        background: rgba(17, 24, 39, 0.92);
        color: #fff;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        pointer-events: none;
        display: none;
      }

      .rss-popover {
        position: fixed;
        z-index: var(--rss-z);
        width: min(360px, calc(100vw - 24px));
        max-height: min(70vh, 520px);
        overflow: auto;
        background: rgba(255,255,255,0.98);
        color: var(--rss-text);
        border: 1px solid var(--rss-border);
        border-radius: 12px;
        box-shadow: var(--rss-shadow);
        padding: 12px;
        display: none;
      }

      .rss-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .rss-popover-title {
        font-weight: 700;
        font-size: 14px;
      }

      .rss-popover-close {
        border: 1px solid var(--rss-border);
        border-radius: 9999px;
        width: 28px;
        height: 28px;
        background: rgba(255,255,255,0.9);
        cursor: pointer;
        line-height: 1;
      }
    `;
  };

  const injectCss = (doc) => {
    const css = uiCss();

    const addStyle = (() => {
      if (typeof GM_addStyle !== "undefined") return GM_addStyle;
      return (rawCss) => {
        const style = doc.createElement("style");
        style.textContent = rawCss;
        (doc.head || doc.documentElement).appendChild(style);
      };
    })();

    if (doc.head) {
      addStyle(css);
      return;
    }

    doc.addEventListener(
      "DOMContentLoaded",
      () => {
        addStyle(css);
      },
      { once: true }
    );
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const safeText = (node) => node?.innerText ?? node?.textContent ?? "";
  const compactWs = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const isHoverCapable = (win) => {
    try {
      return Boolean(win?.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches);
    } catch {
      return false;
    }
  };

  const closestAcrossShadow = (win, startEl, selector) => {
    let el = startEl;
    while (el) {
      if (el instanceof win.Element && el.matches?.(selector)) return el;

      const parent = el.parentElement;
      if (parent) {
        el = parent;
        continue;
      }

      const root = el.getRootNode?.();
      // Attempt to cross open shadow roots.
      el = root?.host || null;
    }

    return null;
  };

  const normalizeUsername = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    return s.replace(/^u\//i, "").replace(/^\/u\//i, "");
  };

  const usernameFromHref = (href) => {
    const raw = String(href ?? "");
    const m = raw.match(/\/(?:user|u)\/([^/?#]+)/i);
    if (!m) return "";
    try {
      return normalizeUsername(decodeURIComponent(m[1]));
    } catch {
      return normalizeUsername(m[1]);
    }
  };

  const makeId = (() => {
    let n = 0;
    return () => {
      n += 1;
      return `rss-${n}`;
    };
  })();

  const toDaysOld = (createdUtcSeconds) => {
    const createdMs = Number(createdUtcSeconds) * 1000;
    if (!Number.isFinite(createdMs) || createdMs <= 0) return null;
    const ageMs = Date.now() - createdMs;
    return ageMs < 0 ? 0 : ageMs / (24 * 60 * 60 * 1000);
  };

  const scoreUsername = (username) => {
    const u = String(username ?? "");
    if (!u) return { score: 0, reasons: [] };

    const reasons = [];
    let score = 0;

    const lowered = u.toLowerCase();
    if (lowered.includes("bot")) {
      score += 3;
      reasons.push("username contains 'bot' (+3)");
    }

    if (/\d{4,}$/.test(u)) {
      score += 2;
      reasons.push("username ends with many digits (+2)");
    }

    if (/^[A-Za-z]+[-_][A-Za-z]+\d{2,4}$/.test(u)) {
      score += 2;
      reasons.push("username matches adjective-noun-digits pattern (+2)");
    }

    const digits = (u.match(/\d/g) || []).length;
    if (digits > 0 && digits / u.length > 0.35) {
      score += 1;
      reasons.push("high digit ratio (+1)");
    }

    return { score, reasons };
  };

  const scoreProfile = (profile) => {
    if (!profile) return { score: 0, reasons: [] };

    const reasons = [];
    let score = 0;

    const karma =
      Number(profile.comment_karma ?? 0) + Number(profile.link_karma ?? 0);
    const daysOld = toDaysOld(profile.created_utc);

    if (daysOld !== null && daysOld < 7) {
      score += 3;
      reasons.push(`account age < 7d (+3)`);
    } else if (daysOld !== null && daysOld > 365) {
      score -= 2;
      reasons.push(`account age > 365d (-2)`);
    }

    if (karma < 50) {
      score += 2;
      reasons.push("total karma < 50 (+2)");
    } else if (karma > 2000) {
      score -= 2;
      reasons.push("total karma > 2000 (-2)");
    }

    if (profile.is_employee) {
      score -= 4;
      reasons.push("reddit employee (-4)");
    }

    return { score, reasons };
  };

  /**
   * Declarative text rules (data-only) + fixed rule engine.
   *
   * Rules are evaluated by the same pipeline:
   *   1) Extract features from the text (fixed code)
   *   2) Evaluate conditions + matchers (fixed code)
   *   3) Compute a score delta (fixed code)
   */

  const safeStripToWordish = (s) => {
    try {
      // Keep unicode letters/numbers when supported.
      // c8 ignore next 3
      return String(s ?? "").replace(/[^\p{L}\p{N}<>]+/gu, " ");
    } catch {
      // Fallback for older runtimes.
      return String(s ?? "").replace(/[^a-z0-9<>]+/gi, " ");
    }
  };

  const normalizeForNearDuplicate = (s) => {
    const lowered = String(s ?? "").toLowerCase();
    const withoutUrls = lowered.replace(/https?:\/\/\S+/g, " <url> ");
    const withoutNums = withoutUrls.replace(/\b\d+(?:[.,]\d+)?\b/g, " <num> ");
    const withoutMd = withoutNums.replace(/[\`*_>#]/g, " ");
    const wordish = safeStripToWordish(withoutMd);
    return compactWs(wordish).slice(0, 600);
  };

  const normalizeLineTemplate = (s) => {
    const lowered = String(s ?? "").toLowerCase();
    const withoutUrls = lowered.replace(/https?:\/\/\S+/g, " <url> ");
    const withoutNums = withoutUrls.replace(/\b\d+(?:[.,]\d+)?\b/g, " <num> ");
    const withoutHandles = withoutNums
      .replace(/\bu\/[a-z0-9_-]+\b/gi, " <user> ")
      .replace(/\br\/[a-z0-9_-]+\b/gi, " <sub> ");
    const wordish = safeStripToWordish(withoutHandles);
    return compactWs(wordish).slice(0, 140);
  };

  const isHeadingishLine = (l) => {
    const s = String(l || "").trim();
    if (!s) return false;
    if (s.length < 6 || s.length > 72) return false;
    if (/^https?:\/\//i.test(s)) return false;
    if (/^["'“”‘’]/.test(s)) return false;
    if (/[.!?]$/.test(s)) return false;
    const punct = (s.match(/[.,;()\[\]{}]/g) || []).length;
    if (punct > 3) return false;
    if (/[：:]$/.test(s)) return true;
    try {
      return /^\p{L}/u.test(s);
    } catch {
      return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(s);
    }
  };

  const compileRegex = (pattern, flags = "") => {
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  };

  const formatDelta = (delta, decimals = null) => {
    if (!Number.isFinite(delta)) return String(delta);
    if (decimals === null) {
      if (delta % 1 === 0) return String(delta);
      return delta.toFixed(1);
    }
    return delta.toFixed(decimals);
  };

  const renderReason = (template, vars) => {
    return String(template)
      .replaceAll("{hits}", String(vars.hits ?? 0))
      .replaceAll("{value}", String(vars.value ?? ""))
      .replaceAll("{delta}", String(vars.delta ?? ""));
  };

  const resolveReasonValue = (rule, f, hits) => {
    if (Number.isFinite(rule.reasonValue)) return rule.reasonValue;
    if (rule.reasonValueKey) return f[rule.reasonValueKey];
    return hits;
  };

  const buildTextFeatures = ({ rawOriginal, perUserHistory }) => {
    const raw = compactWs(rawOriginal);
    const lower = raw.toLowerCase();
    const words = raw ? raw.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const lines = rawOriginal.split(/\r?\n/).map((l) => String(l ?? "").trim());
    const nonEmptyLines = lines.filter(Boolean);

    const sentences = raw
      .split(/[.!?]+/)
      .map((s) => compactWs(s))
      .filter(Boolean);

    const sentenceLens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const sentenceCount = sentenceLens.length;
    const sentenceAvgLen =
      sentenceCount > 0 ? sentenceLens.reduce((a, b) => a + b, 0) / sentenceCount : 0;
    const sentenceLenVariance = (() => {
      if (sentenceCount <= 1) return 0;
      const avg = sentenceAvgLen;
      return sentenceLens.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / sentenceCount;
    })();

    const linkCount = (rawOriginal.match(/https?:\/\//gi) || []).length;
    const numberTokenCount = (rawOriginal.match(/\b\d+(?:[.,]\d+)?\b/g) || []).length;

    const emojiPresent = /([\uD83C-\uDBFF][\uDC00-\uDFFF])/.test(rawOriginal);
    const casualMarkerPresent =
      /(\?\s*$)|\b(?:lol|lmao|tbh|imo|imho|jaja|jajaja)\b/i.test(rawOriginal);
    const gpsCoordPresent =
      /\b\d{1,2}°\d{2}'\d{2}"[NS]\b.*\b\d{1,3}°\d{2}'\d{2}"[EW]\b/i.test(rawOriginal);
    const suspiciousTldPresent = /\.(?:xyz|top|click|buzz|live|shop|online|site|store)\b/i.test(raw);
    const contractionHitCount =
      (lower.match(/\b(i'm|you're|we're|they're|can't|won't|didn't|isn't|it's)\b/g) || []).length;
    const listLineCount = nonEmptyLines.filter((l) => /^(?:[-*•]\s+|\d+\.)/.test(l)).length;
    const mdHeadingCount = nonEmptyLines.filter((l) => /^#{1,6}\s+\S+/.test(l)).length;
    const headingishLineCount = nonEmptyLines.filter(isHeadingishLine).length;
    const revisionMarkerCount = nonEmptyLines.filter((l) =>
      /^\(?\s*(?:edit|update|actualiz\w*)\d*\s*[:：]/i.test(l)
    ).length;

    const templateMaxRepeatCount = (() => {
      const templateCounts = new Map();
      for (const l of nonEmptyLines) {
        const t = normalizeLineTemplate(l);
        if (!t) continue;
        if (t.split(/\s+/).length < 4) continue;
        templateCounts.set(t, (templateCounts.get(t) || 0) + 1);
      }
      return Math.max(0, ...templateCounts.values());
    })();

    const shortReplyNormalized = lower.replace(/[^a-z.]/g, "");

    return {
      rawOriginal,
      raw,
      lower,
      words,
      wordCount,
      lines,
      nonEmptyLines,
      hasEnoughWordsForStyleSignals: wordCount >= 8,
      sentences,
      sentenceCount,
      sentenceAvgLen,
      sentenceLenVariance,
      linkCount,
      numberTokenCount,
      emojiPresent,
      casualMarkerPresent,
      gpsCoordPresent,
      suspiciousTldPresent,
      contractionHitCount,
      listLineCount,
      mdHeadingCount,
      headingishLineCount,
      revisionMarkerCount,
      templateMaxRepeatCount,
      shortReplyNormalized,
      perUserHistory,
    };
  };

  const compileTextRules = (rules) => {
    return rules.map((r) => {
      const match = r.match
        ? (() => {
            if (r.match.type === "regex") {
              return {
                ...r.match,
                _re: compileRegex(r.match.pattern, r.match.flags || ""),
              };
            }
            if (r.match.type === "any_regex") {
              return {
                ...r.match,
                _res: (r.match.patterns || [])
                  .map((p) => compileRegex(p, r.match.flags || ""))
                  .filter(Boolean),
              };
            }
            if (r.match.type === "phrases") {
              const phrases = (r.match.phrases || []).map((p) => String(p).toLowerCase());
              return { ...r.match, _phrases: phrases };
            }
            if (r.match.type === "set_in") {
              return { ...r.match, _set: new Set(r.match.values || []) };
            }
            return r.match;
          })()
        : null;

      return { ...r, match };
    });
  };

  const getFeature = (f, key) => {
    if (key === "$hits") return f.$hits;
    return f[key];
  };

  const compare = (left, op, right) => {
    switch (op) {
      case "gte":
        return left >= right;
      case "gt":
        return left > right;
      case "lte":
        return left <= right;
      case "lt":
        return left < right;
      case "eq":
        return left === right;
      case "neq":
        return left !== right;
      default:
        return false;
    }
  };

  const evalMatcherHits = (match, f) => {
    if (!match) return 0;

    if (match.type === "regex") {
      const re = match._re;
      if (!re) return 0;
      const val = String(f[match.target] ?? "");
      if (match.mode === "presence") return re.test(val) ? 1 : 0;
      return (val.match(re) || []).length;
    }

    if (match.type === "any_regex") {
      const val = String(f[match.target] ?? "");
      return (match._res || []).filter((re) => re.test(val)).length;
    }

    if (match.type === "phrases") {
      const hay = String(f[match.target] ?? "");
      const phrases = match._phrases || [];
      let hits = 0;
      for (const p of phrases) {
        if (p && hay.includes(p)) hits += 1;
      }
      return hits;
    }

    if (match.type === "set_in") {
      const val = String(f[match.target] ?? "");
      return match._set?.has(val) ? 1 : 0;
    }

    if (match.type === "per_user_near_duplicate") {
      const h = f.perUserHistory;
      if (!h) return 0;
      const norm = normalizeForNearDuplicate(f.rawOriginal);
      if (norm.length < (match.minLen ?? 24)) return 0;
      const prev = h.get(norm) || 0;
      h.set(norm, prev + 1);
      return prev >= 1 ? 1 : 0;
    }

    return 0;
  };

  const computeDelta = (score, f) => {
    if (!score) return 0;
    if (score.mode === "fixed") return Number(score.value ?? 0);

    if (score.mode === "linear_clamped") {
      const inputKey = score.input ?? "$hits";
      const input = Number(getFeature(f, inputKey) ?? 0);
      if (!Number.isFinite(input)) return 0;
      const minInput = score.minInput;
      if (Number.isFinite(minInput) && input < minInput) return 0;

      const offset = Number(score.offset ?? 0);
      const mul = Number(score.mul ?? 1);
      let delta = (input - offset) * mul;

      if (Number.isFinite(score.min)) delta = Math.max(Number(score.min), delta);
      if (Number.isFinite(score.max)) delta = Math.min(Number(score.max), delta);
      return delta;
    }

    return 0;
  };

  const rulePasses = (rule, f, hits) => {
    // If a rule declares a matcher, require it to hit by default.
    // (Otherwise rules like self-disclosure would apply to every text.)
    if (rule.match && !rule.allowZeroHits) {
      if (!Number.isFinite(hits) || hits <= 0) return false;
    }

    const conditions = rule.when || [];
    for (const cond of conditions) {
      const left = getFeature(f, cond.key);
      if (!compare(left, cond.op, cond.value)) return false;
    }
    return true;
  };

  const runDeclarativeTextRules = (compiledRules, features) => {
    const ai = { score: 0, reasons: [] };
    const botText = { score: 0, reasons: [] };

    const logRuleHit = (data) => {
      try {
        // eslint-disable-next-line no-console
        console.log("[RedditSlopSleuth] text rule hit", data);
      } catch {
        // Ignore.
      }
    };

    for (const rule of compiledRules) {
      const hits = evalMatcherHits(rule.match, features);
      const f = { ...features, $hits: hits };
      if (!rulePasses(rule, f, hits)) continue;

      const delta = computeDelta(rule.score, f);
      if (!Number.isFinite(delta) || delta === 0) continue;

      const reasonValue = resolveReasonValue(rule, f, hits);
      const vars = {
        hits,
        value: reasonValue,
        delta: formatDelta(delta, rule.reasonDecimals ?? null),
      };
      const reason = rule.reason ? renderReason(rule.reason, vars) : null;

      logRuleHit({
        id: rule.id,
        group: rule.group,
        hits,
        delta,
        reason,
        text: String(features.rawOriginal ?? "").slice(0, 240),
      });

      if (rule.group === "ai") {
        ai.score += delta;
        if (reason) ai.reasons.push(reason);
      } else if (rule.group === "botText") {
        botText.score += delta;
        if (reason) botText.reasons.push(reason);
      }
    }

    return {
      ai: { score: clamp(ai.score, 0, 20), reasons: ai.reasons },
      botText: { score: clamp(botText.score, 0, 20), reasons: botText.reasons },
    };
  };

  const TEXT_RULES = compileTextRules([
    // --- AI-ish signals (heuristics, not a detector) ---
    {
      id: "ai.self_disclose",
      group: "ai",
      match: {
        type: "regex",
        target: "raw",
        pattern:
          "\\bas an ai\\b|\\bas an ai language model\\b",
        flags: "i",
        mode: "presence",
      },
      score: { mode: "fixed", value: 10 },
      reason: "self-disclosed AI (+10)",
    },
    {
      id: "ai.meta_framing",
      group: "ai",
      match: {
        type: "any_regex",
        target: "raw",
        patterns: [
          "(\\blet'?s\\b|\\blet me\\b).*\\b(analy[sz]e|break (?:it )?down|go through)\\b",
          "(\\bvoy a\\b|\\bvamos a\\b).*\\b(analizar|desglosar|explicar|revisar)\\b",
        ],
        flags: "i",
      },
      when: [{ key: "$hits", op: "gte", value: 1 }],
      score: { mode: "fixed", value: 1.5 },
      reason: "meta 'let's analyze/break down' framing (+1.5)",
    },
    {
      id: "ai.template_indicators",
      group: "ai",
      match: {
        type: "any_regex",
        target: "raw",
        patterns: [
          "(\\bindicators\\b|\\bsigns\\b|\\bevidence\\b)\\s+(that|of)\\b",
          "(\\bindicadores\\b|\\bseñales\\b|\\bevidencia\\b)\\s+(de|que)\\b",
        ],
        flags: "i",
      },
      when: [{ key: "$hits", op: "gte", value: 1 }],
      score: { mode: "fixed", value: 1 },
      reason: "template 'signs/indicators/evidence' phrasing (+1)",
    },
    {
      id: "ai.formulaic_transitions",
      group: "ai",
      match: {
        type: "phrases",
        target: "lower",
        phrases: [
          "in conclusion",
          "in summary",
          "furthermore",
          "moreover",
          "it is important to note",
          "overall",
          "ultimately",
          // ES
          "en conclusión",
          "en resumen",
          "además",
          "por otro lado",
          "es importante señalar",
          "en general",
          "en última instancia",
        ],
      },
      when: [
        { key: "hasEnoughWordsForStyleSignals", op: "eq", value: true },
        { key: "wordCount", op: "gt", value: 40 },
      ],
      score: {
        mode: "linear_clamped",
        input: "$hits",
        offset: 0,
        mul: 1.2,
        minInput: 1,
        min: 1,
        max: 4,
      },
      reason: "formulaic transitions x{hits} (+{delta})",
      reasonDecimals: 1,
    },
    {
      id: "ai.low_contractions",
      group: "ai",
      when: [
        { key: "hasEnoughWordsForStyleSignals", op: "eq", value: true },
        { key: "wordCount", op: "gt", value: 60 },
        { key: "contractionHitCount", op: "lte", value: 1 },
      ],
      score: { mode: "fixed", value: 2 },
      reason: "very low contractions (+2)",
    },
    {
      id: "ai.long_uniform_sentences",
      group: "ai",
      when: [
        { key: "hasEnoughWordsForStyleSignals", op: "eq", value: true },
        { key: "sentenceCount", op: "gte", value: 4 },
        { key: "wordCount", op: "gt", value: 80 },
        { key: "sentenceAvgLen", op: "gte", value: 18 },
        { key: "sentenceLenVariance", op: "lt", value: 10 },
      ],
      score: { mode: "fixed", value: 2 },
      reason: "long uniform sentences (+2)",
    },
    {
      id: "ai.structured_list_formatting",
      group: "ai",
      when: [
        { key: "hasEnoughWordsForStyleSignals", op: "eq", value: true },
        { key: "wordCount", op: "gt", value: 60 },
        { key: "listLineCount", op: "gte", value: 3 },
      ],
      score: { mode: "fixed", value: 1.5 },
      reason: "structured list formatting (+1.5)",
    },
    {
      id: "ai.high_section_density",
      group: "ai",
      when: [
        { key: "wordCount", op: "gte", value: 240 },
        { key: "headingishLineCount", op: "gte", value: 6 },
      ],
      score: {
        mode: "linear_clamped",
        input: "headingishLineCount",
        offset: 4,
        mul: 0.35,
        minInput: 6,
        min: 1.0,
        max: 2.5,
      },
      reason: "high section density x{value} (+{delta})",
      reasonValueKey: "headingishLineCount",
      reasonDecimals: 1,
    },
    {
      id: "ai.revision_markers",
      group: "ai",
      when: [
        { key: "wordCount", op: "gte", value: 200 },
        { key: "revisionMarkerCount", op: "gte", value: 2 },
      ],
      score: {
        mode: "linear_clamped",
        input: "revisionMarkerCount",
        offset: 0,
        mul: 0.75,
        minInput: 2,
        min: 1.0,
        max: 3.0,
      },
      reason: "many revision markers x{value} (+{delta})",
      reasonValueKey: "revisionMarkerCount",
      reasonDecimals: 1,
    },
    {
      id: "ai.repeated_line_templates",
      group: "ai",
      when: [
        { key: "wordCount", op: "gte", value: 220 },
        { key: "templateMaxRepeatCount", op: "gte", value: 3 },
      ],
      score: {
        mode: "linear_clamped",
        input: "templateMaxRepeatCount",
        offset: 2,
        mul: 0.9,
        minInput: 3,
        min: 0.9,
        max: 2.7,
      },
      reason: "repeated line templates max x{value} (+{delta})",
      reasonValueKey: "templateMaxRepeatCount",
      reasonDecimals: 1,
    },
    {
      id: "ai.heavy_markdown_sectioning",
      group: "ai",
      when: [
        { key: "wordCount", op: "gte", value: 350 },
        { key: "mdHeadingCount", op: "gte", value: 6 },
      ],
      score: { mode: "fixed", value: 1.5 },
      reason: "heavy markdown sectioning (# headings x{value}) (+1.5)",
      reasonValueKey: "mdHeadingCount",
    },
    {
      id: "ai.many_links",
      group: "ai",
      when: [
        { key: "wordCount", op: "gte", value: 250 },
        { key: "linkCount", op: "gte", value: 6 },
      ],
      score: { mode: "fixed", value: 1 },
      reason: "many links/citations x{value} (+1)",
      reasonValueKey: "linkCount",
    },
    {
      id: "ai.high_numeric_density",
      group: "ai",
      when: [
        { key: "wordCount", op: "gte", value: 280 },
        { key: "numberTokenCount", op: "gte", value: 18 },
      ],
      score: { mode: "fixed", value: 0.8 },
      reason: "high numeric density x{value} (+0.8)",
      reasonValueKey: "numberTokenCount",
    },
    {
      id: "ai.formatted_gps_coordinates",
      group: "ai",
      when: [{ key: "gpsCoordPresent", op: "eq", value: true }],
      score: { mode: "fixed", value: 0.5 },
      reason: "formatted GPS coordinates (+0.5)",
    },
    {
      id: "ai.emoji_penalty",
      group: "ai",
      when: [{ key: "emojiPresent", op: "eq", value: true }],
      score: { mode: "fixed", value: -1 },
      reason: "contains emoji (-1)",
    },
    {
      id: "ai.casual_markers_penalty",
      group: "ai",
      when: [{ key: "casualMarkerPresent", op: "eq", value: true }],
      score: { mode: "fixed", value: -0.5 },
      reason: "contains casual/rhetorical markers (-0.5)",
    },

    // --- Bot-ish text signals ---
    {
      id: "bot.generic_short_reply",
      group: "botText",
      match: {
        type: "set_in",
        target: "shortReplyNormalized",
        values: [
          "lol",
          "nice",
          "this",
          "this.",
          "agreed",
          "same",
          "true",
          "exactly",
          "thanks",
        ],
      },
      when: [{ key: "wordCount", op: "lte", value: 3 }],
      score: { mode: "fixed", value: 2 },
      reason: "generic very short reply (+2)",
    },
    {
      id: "bot.suspicious_tld",
      group: "botText",
      when: [{ key: "suspiciousTldPresent", op: "eq", value: true }],
      score: { mode: "fixed", value: 4 },
      reason: "suspicious TLD in text (+4)",
    },
    {
      id: "bot.multiple_links",
      group: "botText",
      when: [{ key: "linkCount", op: "gte", value: 2 }],
      score: { mode: "fixed", value: 2 },
      reason: "multiple links (+2)",
    },
    {
      id: "bot.near_duplicate_same_user",
      group: "botText",
      match: { type: "per_user_near_duplicate", minLen: 24 },
      when: [{ key: "$hits", op: "gte", value: 1 }],
      score: { mode: "fixed", value: 2 },
      reason: "repeated near-duplicate message by same user (+2)",
    },
  ]);

  const scoreTextSignals = (text, { perUserHistory } = {}) => {
    const rawOriginal = String(text ?? "");
    const features = buildTextFeatures({ rawOriginal, perUserHistory });
    return runDeclarativeTextRules(TEXT_RULES, features);
  };

  const classify = ({ botScore, aiScore, profileScore }) => {
    const kind = (() => {
      if (botScore >= HARD_CODED_THRESHOLDS.bot) return "bot";
      if (aiScore >= HARD_CODED_THRESHOLDS.ai) return "ai";

      const combined = botScore + aiScore + profileScore;
      if (combined <= HARD_CODED_THRESHOLDS.human) return "human";

      return "unknown";
    })();

    const emoji = (() => {
      switch (kind) {
        case "bot":
          return "🤖";
        case "ai":
          return "🧠";
        case "human":
          return "✅";
        default:
          return "❓";
      }
    })();

    return { kind, emoji };
  };

  const fmtScore = (n, { decimals = 1, signed = false } = {}) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    const s = v.toFixed(decimals);
    if (!signed) return s;
    return v > 0 ? `+${s}` : s;
  };

  const ratioToThreshold = (score, threshold) => {
    const s = Number(score);
    const t = Number(threshold);
    if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) return 0;
    return clamp(s / t, 0, 1);
  };

  const fmtThresholdProgress = (score, threshold) => {
    return `${fmtScore(score)} / ${threshold}`;
  };

  const createRedditSlopSleuth = ({ win, doc, fetchFn }) => {
    const state = {
      open: false,
      selectedEntryId: null,
      activePopoverEntryId: null,
      popoverHideTimer: null,
      entries: new Map(), // id -> entry
      perUserHistory: new Map(), // username -> Map(normText -> count)
      profileCache: new Map(), // username -> { fetchedAt, data, promise }
      badgeByUsername: new Map(), // username -> Set(badgeEl)
      tooltipEl: null,
      popoverEl: null,
      ui: null,
      nextProfileFetchAt: 0,
      profileQueue: Promise.resolve(),
      ratelimitedUntil: 0,
    };

    const safeHeaderNumber = (headers, name) => {
      try {
        const v = headers?.get?.(name);
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    };

    const readStoredProfile = (username) => {
      try {
        const raw = win?.localStorage?.getItem?.(`${PROFILE_STORAGE_PREFIX}${username}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const fetchedAt = Number(parsed.fetchedAt);
        if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;

        const age = Date.now() - fetchedAt;
        if (parsed.status === "ok") {
          if (age < PROFILE_CACHE_TTL_MS) return { status: "ok", data: parsed.data ?? null, fetchedAt };
          return null;
        }

        if (parsed.status === "fail") {
          if (age < PROFILE_FAILURE_TTL_MS) return { status: "fail", data: null, fetchedAt };
          return null;
        }
      } catch {
        return null;
      }

      return null;
    };

    const writeStoredProfile = (username, payload) => {
      try {
        win?.localStorage?.setItem?.(
          `${PROFILE_STORAGE_PREFIX}${username}`,
          JSON.stringify(payload)
        );
      } catch {
        // Ignore quota/private mode.
      }
    };

    const profileQueueFetch = async (fn) => {
      state.profileQueue = state.profileQueue.then(async () => {
        const now = Date.now();
        const gate = Math.max(state.nextProfileFetchAt, state.ratelimitedUntil);
        const waitMs = Math.max(0, gate - now);
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        try {
          return await fn();
        } finally {
          state.nextProfileFetchAt = Math.max(
            Date.now() + PROFILE_MIN_INTERVAL_MS,
            state.ratelimitedUntil
          );
        }
      });
      return state.profileQueue;
    };

    const getUserProfile = async (username) => {
      const u = normalizeUsername(username);
      if (!u) return null;

      // If Reddit is currently rate-limiting us, skip.
      if (Date.now() < state.ratelimitedUntil) return null;

      // Persistent cache (survives SPA navigation / page refreshes).
      const stored = readStoredProfile(u);
      if (stored?.status === "ok") return stored.data || null;
      if (stored?.status === "fail") return null;

      const cached = state.profileCache.get(u);
      if (cached) {
        const age = Date.now() - cached.fetchedAt;
        if (cached.data && age < PROFILE_CACHE_TTL_MS) return cached.data;
        if (cached.error && age < PROFILE_FAILURE_TTL_MS) return null;
      }

      if (cached?.promise) return cached.promise;

      const promise = profileQueueFetch(async () => {
        try {
          const res = await fetchFn(`/user/${encodeURIComponent(u)}/about.json`, {
            credentials: "include",
          });

          // Respect Reddit rate limiting.
          if (res.status === 429) {
            const resetSeconds = safeHeaderNumber(res.headers, "x-ratelimit-reset");
            const backoffMs = (resetSeconds ?? 120) * 1000;
            state.ratelimitedUntil = Math.max(state.ratelimitedUntil, Date.now() + backoffMs);

            state.profileCache.set(u, {
              fetchedAt: Date.now(),
              data: null,
              promise: null,
              error: true,
            });
            writeStoredProfile(u, { status: "fail", fetchedAt: Date.now() });
            return null;
          }

          if (!res.ok) throw new Error(`about.json HTTP ${res.status}`);

          // If we're close to the limit, pre-emptively slow down.
          const remaining = safeHeaderNumber(res.headers, "x-ratelimit-remaining");
          const resetSeconds = safeHeaderNumber(res.headers, "x-ratelimit-reset");
          if (remaining !== null && remaining <= 2 && resetSeconds !== null) {
            state.ratelimitedUntil = Math.max(
              state.ratelimitedUntil,
              Date.now() + resetSeconds * 1000
            );
          }

          const json = await res.json();
          const data = json?.data;
          state.profileCache.set(u, { fetchedAt: Date.now(), data, promise: null, error: false });
          writeStoredProfile(u, { status: "ok", fetchedAt: Date.now(), data });
          return data || null;
        } catch {
          state.profileCache.set(u, {
            fetchedAt: Date.now(),
            data: null,
            promise: null,
            error: true,
          });
          writeStoredProfile(u, { status: "fail", fetchedAt: Date.now() });
          return null;
        }
      });

      state.profileCache.set(u, { fetchedAt: Date.now(), data: null, promise, error: false });
      return promise;
    };

    const buildUi = () => {
      if (state.ui) return state.ui;

      const root = doc.createElement("div");
      root.id = UI_ROOT_ID;
      root.className = "rss-fixed rss-bottom-4 rss-right-4";

      const gearBtn = doc.createElement("button");
      gearBtn.className = "rss-gear rss-select-none rss-cursor-pointer rss-focus-ring";
      gearBtn.type = "button";
      gearBtn.title = "RedditSlopSleuth";
      gearBtn.textContent = "⚙️";

      const overlay = doc.createElement("div");
      overlay.className = "rss-fixed rss-inset-0 rss-overlay";
      overlay.style.display = "none";

      const drawer = doc.createElement("div");
      drawer.className = "rss-fixed rss-top-0 rss-right-0 rss-w-96 rss-drawer";
      drawer.style.display = "none";
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-label", "RedditSlopSleuth");

      const tooltip = doc.createElement("div");
      tooltip.className = "rss-tooltip";
      doc.body.appendChild(tooltip);
      state.tooltipEl = tooltip;

      const popover = doc.createElement("div");
      popover.className = "rss-popover";
      doc.body.appendChild(popover);
      state.popoverEl = popover;

        const render = () => {
        const selected = state.selectedEntryId
          ? state.entries.get(state.selectedEntryId)
          : null;

        const counts = {
          bot: 0,
          ai: 0,
          human: 0,
          unknown: 0,
        };
        for (const e of state.entries.values()) counts[e.classification.kind] += 1;

        drawer.innerHTML = "";

        const header = doc.createElement("div");
        header.className = "rss-flex rss-justify-between rss-items-center rss-p-4";
        header.innerHTML = `
          <div>
            <div class="rss-font-bold rss-text-base">RedditSlopSleuth</div>
            <div class="rss-text-sm rss-muted">Badges: ${counts.bot} 🤖 · ${counts.ai} 🧠 · ${counts.human} ✅ · ${counts.unknown} ❓</div>
          </div>
        `;

        const closeBtn = doc.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "rss-btn rss-cursor-pointer rss-focus-ring";
        closeBtn.textContent = "Close";
        closeBtn.addEventListener("click", () => setOpen(false));
        header.appendChild(closeBtn);

        const body = doc.createElement("div");
        body.className = "rss-p-4 rss-flex rss-flex-col rss-gap-3 rss-overflow-auto rss-max-h-80vh";

        const details = doc.createElement("div");
        details.className = "rss-row";

        if (!selected) {
          details.innerHTML = `<div class="rss-font-semibold">Click a badge</div><div class="rss-text-sm rss-muted">Click 🤖/🧠/✅/❓ next to a username to see why.</div>`;
        } else {
          const pill = (label, value) => {
            const p = doc.createElement("span");
            p.className = "rss-pill";
            p.innerHTML = `<span class="rss-muted">${label}</span><span class="rss-font-semibold">${value}</span>`;
            return p;
          };

          const top = doc.createElement("div");
          top.className = "rss-flex rss-flex-col rss-gap-2";
          const title = doc.createElement("div");
          title.className = "rss-font-bold rss-text-base";
          title.textContent = `${selected.classification.emoji} u/${selected.username}`;
          top.appendChild(title);

          const verdict = doc.createElement("div");
          verdict.className = "rss-text-sm rss-muted";
          verdict.textContent = `Verdict: ${selected.classification.kind}`;
          top.appendChild(verdict);

          const pills = doc.createElement("div");
          pills.className = "rss-flex rss-gap-2";
          pills.appendChild(pill("Bot", fmtThresholdProgress(selected.scores.bot, HARD_CODED_THRESHOLDS.bot)));
          pills.appendChild(pill("AI", fmtThresholdProgress(selected.scores.ai, HARD_CODED_THRESHOLDS.ai)));
          pills.appendChild(pill("Profile", fmtScore(selected.scores.profile, { signed: true })));
          top.appendChild(pills);

          const meters = doc.createElement("div");
          meters.className = "rss-meters";

          const makeMeter = ({ label, value, threshold, meterKind }) => {
            const pct = Math.round(ratioToThreshold(value, threshold) * 100);
            const wrap = doc.createElement("div");
            const row = doc.createElement("div");
            row.className = "rss-meter-row";
            row.innerHTML = `<span>${label}</span><span>${fmtThresholdProgress(value, threshold)}</span>`;

            const track = doc.createElement("div");
            track.className = "rss-meter-track";
            const fill = doc.createElement("div");
            fill.className = "rss-meter-fill";
            fill.setAttribute("data-rss-meter", meterKind);
            fill.style.width = `${pct}%`;
            track.appendChild(fill);

            wrap.appendChild(row);
            wrap.appendChild(track);
            return wrap;
          };

          const botRatio = ratioToThreshold(selected.scores.bot, HARD_CODED_THRESHOLDS.bot);
          const aiRatio = ratioToThreshold(selected.scores.ai, HARD_CODED_THRESHOLDS.ai);
          const overallRatio = Math.max(botRatio, aiRatio);

          // Overall is the max of "how close are we" to either bot/AI thresholds.
          meters.appendChild(
            (() => {
              const pct = Math.round(overallRatio * 100);
              const wrap = doc.createElement("div");
              const row = doc.createElement("div");
              row.className = "rss-meter-row";
              row.innerHTML = `<span>Overall</span><span>${pct}%</span>`;
              const track = doc.createElement("div");
              track.className = "rss-meter-track";
              const fill = doc.createElement("div");
              fill.className = "rss-meter-fill";
              fill.setAttribute("data-rss-meter", "overall");
              fill.style.width = `${pct}%`;
              track.appendChild(fill);
              wrap.appendChild(row);
              wrap.appendChild(track);
              return wrap;
            })()
          );

          meters.appendChild(
            makeMeter({
              label: "Bot",
              value: selected.scores.bot,
              threshold: HARD_CODED_THRESHOLDS.bot,
              meterKind: "bot",
            })
          );
          meters.appendChild(
            makeMeter({
              label: "AI",
              value: selected.scores.ai,
              threshold: HARD_CODED_THRESHOLDS.ai,
              meterKind: "ai",
            })
          );

          top.appendChild(meters);

          const why = doc.createElement("div");
          const whyList = doc.createElement("ul");
          whyList.className = "rss-why";

          const reasons = [
            ...selected.reasons.bot,
            ...selected.reasons.ai,
            ...selected.reasons.profile,
          ];
          for (const r of reasons.slice(0, 12)) {
            const li = doc.createElement("li");
            li.textContent = r;
            whyList.appendChild(li);
          }
          why.appendChild(whyList);

          const btnRow = doc.createElement("div");
          btnRow.className = "rss-flex rss-gap-2";
          const scrollBtn = doc.createElement("button");
          scrollBtn.type = "button";
          scrollBtn.className = "rss-btn rss-btn-primary rss-focus-ring";
          scrollBtn.textContent = "Scroll to item";
          scrollBtn.addEventListener("click", () => {
            selected.element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
          });
          btnRow.appendChild(scrollBtn);

          details.innerHTML = "";
          details.appendChild(top);
          details.appendChild(why);
          details.appendChild(btnRow);
        }

        const list = doc.createElement("div");
        list.className = "rss-row";
        const listTitle = doc.createElement("div");
        listTitle.className = "rss-font-semibold";
        listTitle.textContent = "Recent";
        list.appendChild(listTitle);

        const listBody = doc.createElement("div");
        listBody.className = "rss-flex rss-flex-col rss-gap-2";

        const entries = Array.from(state.entries.values()).slice(-30).reverse();
        if (entries.length === 0) {
          const empty = doc.createElement("div");
          empty.className = "rss-text-sm rss-muted";
          empty.textContent = "Nothing analyzed yet.";
          listBody.appendChild(empty);
        } else {
          for (const e of entries) {
            const row = doc.createElement("div");
            row.className = "rss-row rss-hover-bg rss-cursor-pointer";
            row.innerHTML = `<div class="rss-flex rss-justify-between rss-items-center"><div class="rss-font-semibold">${e.classification.emoji} u/${e.username}</div><div class="rss-text-sm rss-muted">Bot ${fmtThresholdProgress(e.scores.bot, HARD_CODED_THRESHOLDS.bot)} · AI ${fmtThresholdProgress(e.scores.ai, HARD_CODED_THRESHOLDS.ai)}</div></div>`;
            row.addEventListener("click", () => {
              state.selectedEntryId = e.id;
              render();
              e.element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            });
            listBody.appendChild(row);
          }
        }
        list.appendChild(listBody);

        body.appendChild(details);
        body.appendChild(list);

        drawer.appendChild(header);
        drawer.appendChild(body);
      };

      const setOpen = (open) => {
        state.open = Boolean(open);
        overlay.style.display = state.open ? "block" : "none";
        drawer.style.display = state.open ? "block" : "none";
        if (state.open) render();
      };

      const hidePopover = () => {
        if (!state.popoverEl) return;
        state.popoverEl.style.display = "none";
        state.activePopoverEntryId = null;
      };

      const cancelPopoverHide = () => {
        if (state.popoverHideTimer) {
          win.clearTimeout(state.popoverHideTimer);
          state.popoverHideTimer = null;
        }
      };

      const schedulePopoverHide = (delayMs = 120) => {
        cancelPopoverHide();
        state.popoverHideTimer = win.setTimeout(() => {
          hidePopover();
        }, delayMs);
      };

      overlay.addEventListener("click", () => setOpen(false));
      gearBtn.addEventListener("click", () => setOpen(!state.open));

      doc.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hidePopover();
      });

      doc.addEventListener("click", (e) => {
        const target = e.target;
        if (!(target instanceof win.Node)) return;
        const pop = state.popoverEl;
        if (pop && pop.style.display === "block" && !pop.contains(target)) {
          hidePopover();
        }
      });

      // Keep hover popover open while hovering it.
      popover.addEventListener("pointerenter", () => cancelPopoverHide());
      popover.addEventListener("pointerleave", () => schedulePopoverHide(120));

      root.appendChild(gearBtn);
      doc.body.appendChild(root);
      doc.body.appendChild(overlay);
      doc.body.appendChild(drawer);

      state.ui = {
        root,
        gearBtn,
        overlay,
        drawer,
        render,
        setOpen,
        hidePopover,
        cancelPopoverHide,
        schedulePopoverHide,
      };
      return state.ui;
    };

    const addBadgeRef = (username, badgeEl) => {
      const u = normalizeUsername(username);
      if (!u) return;
      const set = state.badgeByUsername.get(u) || new Set();
      set.add(badgeEl);
      state.badgeByUsername.set(u, set);
    };

    const setTooltip = ({ x, y, html, show }) => {
      const t = state.tooltipEl;
      if (!t) return;
      if (!show) {
        t.style.display = "none";
        return;
      }
      t.innerHTML = html;
      t.style.left = `${x + 14}px`;
      t.style.top = `${y + 14}px`;
      t.style.display = "block";
    };

      const setPopover = ({ badgeEl, entry, show }) => {
      const pop = state.popoverEl;
      if (!pop) return;
      if (!show || !entry) {
        pop.style.display = "none";
        state.activePopoverEntryId = null;
        return;
      }

      const reasons = [
        ...entry.reasons.bot,
        ...entry.reasons.ai,
        ...entry.reasons.profile,
      ].slice(0, 12);

      const escapeHtml = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const botRatio = ratioToThreshold(entry.scores.bot, HARD_CODED_THRESHOLDS.bot);
      const aiRatio = ratioToThreshold(entry.scores.ai, HARD_CODED_THRESHOLDS.ai);
      const overallRatio = Math.max(botRatio, aiRatio);
      const overallPct = Math.round(overallRatio * 100);
      const botPct = Math.round(botRatio * 100);
      const aiPct = Math.round(aiRatio * 100);

      pop.innerHTML = `
        <div class="rss-popover-header">
          <div class="rss-popover-title">${entry.classification.emoji} u/${entry.username}</div>
          <button type="button" class="rss-popover-close" aria-label="Close">✕</button>
        </div>
        <div class="rss-text-sm rss-muted" style="margin-bottom:6px">Verdict: ${entry.classification.kind}</div>
        <div class="rss-text-sm rss-muted" style="margin-bottom:8px">Bot ${fmtThresholdProgress(entry.scores.bot, HARD_CODED_THRESHOLDS.bot)} · AI ${fmtThresholdProgress(entry.scores.ai, HARD_CODED_THRESHOLDS.ai)} · Profile ${fmtScore(entry.scores.profile, { signed: true })}</div>

        <div class="rss-meters" style="margin-bottom:10px">
          <div>
            <div class="rss-meter-row"><span>Overall</span><span>${overallPct}%</span></div>
            <div class="rss-meter-track"><div class="rss-meter-fill" data-rss-meter="overall" style="width:${overallPct}%"></div></div>
          </div>
          <div>
            <div class="rss-meter-row"><span>Bot</span><span>${escapeHtml(fmtThresholdProgress(entry.scores.bot, HARD_CODED_THRESHOLDS.bot))}</span></div>
            <div class="rss-meter-track"><div class="rss-meter-fill" data-rss-meter="bot" style="width:${botPct}%"></div></div>
          </div>
          <div>
            <div class="rss-meter-row"><span>AI</span><span>${escapeHtml(fmtThresholdProgress(entry.scores.ai, HARD_CODED_THRESHOLDS.ai))}</span></div>
            <div class="rss-meter-track"><div class="rss-meter-fill" data-rss-meter="ai" style="width:${aiPct}%"></div></div>
          </div>
        </div>

        <ul class="rss-why">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      `;

      pop.querySelector(".rss-popover-close")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pop.style.display = "none";
        state.activePopoverEntryId = null;
      });

      // Show first, then position with measured size.
      pop.style.display = "block";
      state.activePopoverEntryId = entry.id;

      const margin = 12;
      const rect = badgeEl?.getBoundingClientRect?.() || {
        left: margin,
        top: margin,
        right: margin,
        bottom: margin,
      };
      const popRect = pop.getBoundingClientRect();
      const w = popRect.width || 320;
      const h = popRect.height || 200;

      let x = rect.right + 10;
      let y = rect.top;

      x = clamp(x, margin, win.innerWidth - w - margin);
      y = clamp(y, margin, win.innerHeight - h - margin);

      pop.style.left = `${Math.round(x)}px`;
      pop.style.top = `${Math.round(y)}px`;
    };

    const resolveHiddenPostAuthor = (container) => {
      const menu =
        container.querySelector?.("shreddit-post-overflow-menu[author-name]") ||
        container.querySelector?.("[author-name]");
      const name = menu?.getAttribute?.("author-name");
      return normalizeUsername(name);
    };

    const resolveFeedInsertionEl = (container) => {
      return (
        // Prefer the hovercard host itself; inserting inside its slotted structure can get hidden.
        container.querySelector?.('faceplate-hovercard[data-id="community-hover-card"], faceplate-hovercard') ||
        container.querySelector?.('[data-testid="subreddit-name"]') ||
        container.querySelector?.('[slot="credit-bar"]') ||
        container.querySelector?.("shreddit-post-overflow-menu") ||
        null
      );
    };

    const hasExistingBadgeNear = (authorEl) => {
      if (!authorEl) return false;

      const rplHover = closestAcrossShadow(win, authorEl, "rpl-hovercard");
      if (rplHover?.nextElementSibling?.getAttribute?.(BADGE_ATTR) === "true") return true;

      const authorMeta = authorEl.closest?.(".author-name-meta");
      if (authorMeta?.nextElementSibling?.getAttribute?.(BADGE_ATTR) === "true") return true;

      const nowrap = authorEl.querySelector?.(".whitespace-nowrap");
      if (nowrap?.querySelector?.(`[${BADGE_ATTR}="true"]`)) return true;

      if (authorEl.nextElementSibling?.getAttribute?.(BADGE_ATTR) === "true") return true;

      return false;
    };

    const insertBadge = ({ authorEl, badgeEl }) => {
      // Comments (new Reddit): author is often wrapped in <rpl-hovercard>. Inserting inside it can
      // cause layout glitches; place badge as a sibling after the hovercard.
      const rplHover = closestAcrossShadow(win, authorEl, "rpl-hovercard");
      if (rplHover) {
        rplHover.insertAdjacentElement("afterend", badgeEl);
        return;
      }

      // Comments: the author is inside an overflow-hidden container; insert as a flex item after it.
      const authorMeta = authorEl?.closest?.(".author-name-meta");
      if (authorMeta) {
        authorMeta.insertAdjacentElement("afterend", badgeEl);
        return;
      }

      // Avoid inserting the badge inside a link; Reddit may treat the whole author row as navigable.
      const link = authorEl?.closest?.("a[href]");
      if (link) {
        link.insertAdjacentElement("afterend", badgeEl);
        return;
      }

      // Subreddit/post headers: keep name+badge together inside nowrap span to avoid line wraps.
      const nowrap = authorEl?.querySelector?.(".whitespace-nowrap");
      if (nowrap) {
        nowrap.appendChild(badgeEl);
        return;
      }

      authorEl?.insertAdjacentElement?.("afterend", badgeEl);
    };

    const computeEntry = async ({ element, authorEl, username, text }) => {
      const perUser = state.perUserHistory.get(username) || new Map();
      state.perUserHistory.set(username, perUser);

      const nameScore = scoreUsername(username);
      const textScore = scoreTextSignals(text, { perUserHistory: perUser });

      const profile = await getUserProfile(username);
      const profileScore = scoreProfile(profile);

      const botScore = nameScore.score + textScore.botText.score + profileScore.score;
      const aiScore = textScore.ai.score;

      const classification = classify({
        botScore,
        aiScore,
        profileScore: profileScore.score,
      });

      return {
        scores: { bot: botScore, ai: aiScore, profile: profileScore.score },
        breakdown: {
          bot: {
            username: nameScore.score,
            text: textScore.botText.score,
            profile: profileScore.score,
          },
          ai: {
            text: textScore.ai.score,
          },
        },
        reasons: {
          bot: [...nameScore.reasons, ...textScore.botText.reasons],
          ai: [...textScore.ai.reasons],
          profile: [...profileScore.reasons],
        },
        classification,
      };
    };

    const attachBadge = async ({ element, authorEl, username, text }) => {
      const u = normalizeUsername(username);
      if (!u || !authorEl) return;

      // One badge per author element.
      if (hasExistingBadgeNear(authorEl)) {
        return;
      }

      const badge = doc.createElement("span");
      badge.className = "rss-badge";
      badge.setAttribute(BADGE_ATTR, "true");
      badge.setAttribute("data-rss-kind", "unknown");
      badge.textContent = "❓";

      const entryId = makeId();
      badge.setAttribute(ENTRY_ID_ATTR, entryId);

      insertBadge({ authorEl, badgeEl: badge });
      addBadgeRef(u, badge);

      const ui = buildUi();

      const updateBadgeFromEntry = (entry) => {
        badge.textContent = entry.classification.emoji;
        badge.setAttribute("data-rss-kind", entry.classification.kind);

        const hoverLines = [
          `<div style="font-weight:700;margin-bottom:6px">${entry.classification.emoji} u/${entry.username}</div>`,
          `<div style="margin-bottom:4px"><b>Verdict</b>: ${entry.classification.kind}</div>`,
          `<div><b>Bot</b>: ${fmtThresholdProgress(entry.scores.bot, HARD_CODED_THRESHOLDS.bot)} · <b>AI</b>: ${fmtThresholdProgress(entry.scores.ai, HARD_CODED_THRESHOLDS.ai)} · <b>Profile</b>: ${fmtScore(entry.scores.profile, { signed: true })}</div>`,
        ];
        badge.dataset.rssTooltip = hoverLines.join("");
      };

      const entry = {
        id: entryId,
        username: u,
        element,
        authorEl,
        text,
        scores: { bot: 0, ai: 0, profile: 0 },
        reasons: { bot: [], ai: [], profile: [] },
        classification: { kind: "unknown", emoji: "❓" },
      };
      state.entries.set(entryId, entry);

      // Compute asynchronously (may fetch profile).
      const computed = await computeEntry({ element, authorEl, username: u, text });
      entry.scores = computed.scores;
      entry.reasons = computed.reasons;
      entry.classification = computed.classification;
      updateBadgeFromEntry(entry);

      badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.selectedEntryId = entry.id;

        // Mobile-friendly behavior: click toggles a popover (no sidebar).
        const isOpen = state.activePopoverEntryId === entry.id;
        if (isOpen) {
          setPopover({ show: false });
        } else {
          setPopover({ badgeEl: badge, entry, show: true });
        }

        // If the drawer is already open (gear), keep it in sync without forcing it open.
        if (state.open) ui.render();
      });

      const hoverEnabled = isHoverCapable(win);

      badge.addEventListener("pointerenter", (e) => {
        if (hoverEnabled) {
          ui.cancelPopoverHide?.();
          setPopover({ badgeEl: badge, entry, show: true });
          return;
        }

        const html = badge.dataset.rssTooltip;
        if (!html) return;
        setTooltip({ x: e.pageX, y: e.pageY, html, show: true });
      });

      badge.addEventListener("pointerleave", () => {
        if (hoverEnabled) {
          ui.schedulePopoverHide?.(120);
          return;
        }
        setTooltip({ show: false });
      });

      badge.addEventListener("pointermove", (e) => {
        if (hoverEnabled) return;
        const html = badge.dataset.rssTooltip;
        if (!html) return;
        setTooltip({ x: e.pageX, y: e.pageY, html, show: true });
      });
    };

    const extractUsernameFromAuthorEl = (authorEl) => {
      const text = compactWs(safeText(authorEl));
      const fromText = normalizeUsername(text);
      if (fromText) return fromText;
      return usernameFromHref(authorEl.getAttribute?.("href"));
    };

    const extractText = (container) => {
      const normalize = (s) =>
        String(s ?? "")
          .replace(/\r\n/g, "\n")
          .trim()
          .replace(/\n{3,}/g, "\n\n");

      for (const sel of SELECTORS.text) {
        const node = container.querySelector(sel);
        const txt = normalize(safeText(node));
        if (txt) return txt;
      }

      // Fallback: paragraphs.
      const ps = Array.from(container.querySelectorAll("p"));
      const para = normalize(ps.map((p) => safeText(p)).join("\n"));
      if (para) return para;

      // Final fallback: container text.
      return normalize(safeText(container));
    };

    const scanRoot = async (root) => {
      const contentSel = SELECTORS.content.join(", ");
      const hostSel = [
        "shreddit-post",
        "shreddit-comment",
        "shreddit-comment-tree",
        "rpl-hovercard",
        "faceplate-hovercard",
      ].join(", ");

      // Reddit uses shadow DOM heavily; querySelectorAll() does not cross shadow roots.
      // Do a bounded BFS across known host components with open shadow roots.
      const nodesSet = new Set();
      const seenRoots = new Set();
      const queue = [root];

      while (queue.length) {
        const r = queue.pop();
        if (!r || seenRoots.has(r)) continue;
        seenRoots.add(r);

        if (typeof r.querySelectorAll === "function") {
          for (const n of r.querySelectorAll(contentSel)) nodesSet.add(n);
          for (const host of r.querySelectorAll(hostSel)) {
            if (host?.shadowRoot) queue.push(host.shadowRoot);
          }
        }
      }

      const nodes = Array.from(nodesSet);
      const tasks = [];

      // Note: `div[data-testid="comment"]` is also a *container* on new Reddit.
      // Keep it for extraction, but exclude it from mention filtering.
      const textSelForMentionFiltering = SELECTORS.text
        .filter((s) => s !== 'div[data-testid="comment"]')
        .join(", ");

      const usernameSels = SELECTORS.username;
      const findAuthorEl = (container) => {
        // Prefer the visible handle link in comment meta blocks (avoid the avatar link).
        const authorMetaTextLink = container.querySelector?.(
          '.author-name-meta a[href^="/user/"], .author-name-meta a[href^="/u/"]'
        );
        if (
          authorMetaTextLink &&
          !(textSelForMentionFiltering && authorMetaTextLink.closest?.(textSelForMentionFiltering))
        ) {
          return authorMetaTextLink;
        }

        for (const sel of usernameSels) {
          const el = container.querySelector(sel);
          if (!el) continue;
          // Avoid u/mentions inside the body text.
          if (textSelForMentionFiltering && el.closest?.(textSelForMentionFiltering)) continue;
          // Avoid links inside hovercard content slots (not the visible author handle).
          if (el.closest?.('[slot="content"]')) continue;
          // Avoid user links inside overflow menus.
          if (el.closest?.("shreddit-post-overflow-menu")) continue;
          // Avoid avatar-only profile links (common in comments).
          const visibleText = compactWs(safeText(el));
          if (!visibleText && el.querySelector?.("img, faceplate-img, svg")) continue;
          return el;
        }

        // Final fallback: first user link not in body text.
        const candidates = Array.from(
          container.querySelectorAll('a[href^="/user/"], a[href^="/u/"], a[href*="/user/"], a[href*="/u/"]')
        );
        for (const el of candidates) {
          if (textSelForMentionFiltering && el.closest?.(textSelForMentionFiltering)) continue;
          if (el.closest?.('[slot="content"]')) continue;
          if (el.closest?.("shreddit-post-overflow-menu")) continue;
          const visibleText = compactWs(safeText(el));
          if (!visibleText && el.querySelector?.("img, faceplate-img, svg")) continue;
          return el;
        }
        return null;
      };

      for (const node of nodes) {
        if (!(node instanceof win.HTMLElement)) continue;
        const hasBadge = Boolean(node.querySelector?.(`[${BADGE_ATTR}="true"]`));
        const processed = node.getAttribute(PROCESSED_ATTR) === "true";

        // Some parts of Reddit re-render and can remove our injected badge while keeping the same
        // container node. If that happens, allow reprocessing.
        if (processed && !hasBadge) node.removeAttribute(PROCESSED_ATTR);
        if (processed && hasBadge) continue;

        // If a badge already exists anywhere inside, mark as done.
        if (hasBadge) {
          node.setAttribute(PROCESSED_ATTR, "true");
          continue;
        }

        // Skip injecting into our own UI.
        if (node.closest?.(`#${UI_ROOT_ID}, .rss-drawer, .rss-overlay, .rss-tooltip, .rss-popover`)) {
          continue;
        }

        let authorEl = findAuthorEl(node);
        let username = authorEl ? extractUsernameFromAuthorEl(authorEl) : "";

        // Home feed sometimes doesn't show the author. Also, posts can contain other user links
        // (avatars, hovercards, etc.) that are NOT the author. Prefer overflow-menu author-name.
        const hiddenAuthor = resolveHiddenPostAuthor(node);
        if (hiddenAuthor) {
          const visibleMatches = username && normalizeUsername(username) === hiddenAuthor;
          if (!visibleMatches) {
            username = hiddenAuthor;
            authorEl =
              resolveFeedInsertionEl(node) ||
              node.querySelector?.("shreddit-post-overflow-menu") ||
              authorEl;
          }
        }

        if (!authorEl || !username) continue;

        // Note: posts in the feed may have no body text; allow empty string.
        const text = extractText(node) || "";
        node.setAttribute(PROCESSED_ATTR, "true");
        tasks.push(attachBadge({ element: node, authorEl, username, text }));
      }

      await Promise.all(tasks);
    };

    const refreshAllBadges = async () => {
      // Recompute classification when toggles change.
      const tasks = [];
      for (const entry of state.entries.values()) {
        tasks.push(
          (async () => {
            const computed = await computeEntry({
              element: entry.element,
              authorEl: entry.authorEl,
              username: entry.username,
              text: entry.text,
            });

            entry.scores = computed.scores;
            entry.reasons = computed.reasons;
            entry.classification = computed.classification;

            const badges = state.badgeByUsername.get(entry.username);
            if (!badges) return;
            for (const badgeEl of badges) {
              if (badgeEl.getAttribute(ENTRY_ID_ATTR) !== entry.id) continue;
              badgeEl.textContent = entry.classification.emoji;
              badgeEl.setAttribute("data-rss-kind", entry.classification.kind);

              badgeEl.dataset.rssTooltip = `
                <div style="font-weight:700;margin-bottom:6px">${entry.classification.emoji} u/${entry.username}</div>
                <div style="margin-bottom:4px"><b>Verdict</b>: ${entry.classification.kind}</div>
                <div><b>Bot</b>: ${fmtThresholdProgress(entry.scores.bot, HARD_CODED_THRESHOLDS.bot)} · <b>AI</b>: ${fmtThresholdProgress(entry.scores.ai, HARD_CODED_THRESHOLDS.ai)} · <b>Profile</b>: ${fmtScore(entry.scores.profile, { signed: true })}</div>
              `;
            }
          })()
        );
      }
      await Promise.all(tasks);
    };

    const start = async () => {
      injectCss(doc);
      buildUi();

      await scanRoot(doc);

      const raf =
        typeof win.requestAnimationFrame === "function"
          ? win.requestAnimationFrame.bind(win)
          : (cb) => win.setTimeout(cb, 16);

      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        raf(async () => {
          scheduled = false;
          await scanRoot(doc);
        });
      };

      const observer = new win.MutationObserver(() => schedule());
      observer.observe(doc.body, { childList: true, subtree: true });
    };

    // Expose limited internals for tests.
    const __test = {
      getUserProfile,
      refreshAllBadges,
      _state: state,
    };

    return {
      start,
      scanRoot,
      classify,
      scoreUsername,
      scoreProfile,
      scoreTextSignals,
      __test,
    };
  };

  // Export for tests.
  /* c8 ignore start */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createRedditSlopSleuth };
  }
  /* c8 ignore stop */

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!document.body) return;

  const engine = createRedditSlopSleuth({ win: window, doc: document, fetchFn: window.fetch });
  engine.start();
})();
