// ==UserScript==
// @name         RedditSlopSleuth
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.1.19
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

  // ---------------------------------------------------------------------------
  // File map (single-file userscript)
  // ---------------------------------------------------------------------------
  // - UI + CSS helpers: [`js.uiCss()`](redditslopsleuth.user.js:89)
  // - Feature extraction: [`js.buildTextFeatures()`](redditslopsleuth.user.js:590)
  // - Heuristic rules: [`js.TEXT_RULES`](redditslopsleuth.user.js:912)
  // - ML feature vector: [`js.pickMlFeaturesFromText()`](redditslopsleuth.user.js:1224)
  // - Shipped weights: [`js.RSS_V2_DEFAULT_MODEL`](redditslopsleuth.user.js:1345)
  // - Main engine: [`js.createRedditSlopSleuth()`](redditslopsleuth.user.js:1489)

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

  const HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const HISTORY_FAILURE_TTL_MS = 30 * 60 * 1000;
  const HISTORY_MIN_INTERVAL_MS = 900;
  const HISTORY_STORAGE_PREFIX = "rss-history:";

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
      'div[data-click-id="text"]',
      'div[data-testid="comment"]',
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
      { once: true },
    );
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const safeText = (node) => node?.innerText ?? node?.textContent ?? "";
  const compactWs = (s) =>
    String(s ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const isHoverCapable = (win) => {
    try {
      return Boolean(
        win?.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches,
      );
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

  const parseSubredditFromUrl = (href) => {
    try {
      const s = String(href || "");
      const m = s.match(/\/r\/([A-Za-z0-9_+.-]{2,50})\b/);
      return m ? String(m[1]).toLowerCase() : "";
    } catch {
      return "";
    }
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
    const lowerAposNormalized = lower.replace(/[\u2019\u2018\u02BC]/g, "'");
    const words = raw ? raw.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const lines = rawOriginal.split(/\r?\n/).map((l) => String(l ?? "").trim());
    const nonEmptyLines = lines.filter(Boolean);

    const sentences = raw
      .split(/[.!?]+/)
      .map((s) => compactWs(s))
      .filter(Boolean);

    const sentenceLens = sentences.map(
      (s) => s.split(/\s+/).filter(Boolean).length,
    );
    const sentenceCount = sentenceLens.length;
    const sentenceAvgLen =
      sentenceCount > 0
        ? sentenceLens.reduce((a, b) => a + b, 0) / sentenceCount
        : 0;
    const sentenceLenVariance = (() => {
      if (sentenceCount <= 1) return 0;
      const avg = sentenceAvgLen;
      return (
        sentenceLens.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
        sentenceCount
      );
    })();

    const linkCount = (rawOriginal.match(/https?:\/\//gi) || []).length;
    const numberTokenCount = (rawOriginal.match(/\b\d+(?:[.,]\d+)?\b/g) || [])
      .length;

    const emojiPresent = /([\uD83C-\uDBFF][\uDC00-\uDFFF])/.test(rawOriginal);
    const questionMarkTerminal = /\?\s*$/.test(rawOriginal);
    const casualMarkerPresent =
      /\b(?:lol|lmao|tbh|imo|imho|jaja|jajaja)\b/i.test(rawOriginal);
    const gpsCoordPresent =
      /\b\d{1,2}°\d{2}'\d{2}"[NS]\b.*\b\d{1,3}°\d{2}'\d{2}"[EW]\b/i.test(
        rawOriginal,
      );
    const suspiciousTldPresent =
      /\.(?:xyz|top|click|buzz|live|shop|online|site|store)\b/i.test(raw);

    // Very lightweight English-like detector, used to gate language-dependent style signals.
    // Requirements:
    // - enough tokens to be meaningful
    // - at least a few common English function words present
    const englishStopwordHits = (() => {
      if (!raw) return 0;
      const matches = lowerAposNormalized.match(
        /\b(?:the|and|to|of|is|are|was|were|be|been|have|has|had|do|does|did|not|that|this|you|i|we|they|it|in|for|with|on|as)\b/g,
      );
      return (matches || []).length;
    })();
    const englishLike = wordCount >= 20 && englishStopwordHits >= 3;
    // Note: avoid multi-line regex literals because they can't contain unescaped newlines.
    // We normalize smart apostrophes (’ etc.) to ASCII (').
    const contractionHitCount = (
      lowerAposNormalized.match(
        /\b(?:i'(?:m|ve|ll|d)|you'(?:re|ve|ll|d)|we'(?:re|ve|ll|d)|they'(?:re|ve|ll|d)|he'(?:s|ll|d)|she'(?:s|ll|d)|it'(?:s|ll|d)|that'(?:s|ll|d)|there's|here's|what's|who's|let's|y'all|[a-z]+n't)\b/g,
      ) || []
    ).length;
    const contractionsPer100Words =
      wordCount > 0 ? (contractionHitCount / wordCount) * 100 : 0;
    const listLineCount = nonEmptyLines.filter((l) =>
      /^(?:[-*•]\s+|\d+\.)/.test(l),
    ).length;
    const mdHeadingCount = nonEmptyLines.filter((l) =>
      /^#{1,6}\s+\S+/.test(l),
    ).length;
    const headingishLineCount = nonEmptyLines.filter(isHeadingishLine).length;
    const revisionMarkerCount = nonEmptyLines.filter((l) =>
      /^\(?\s*(?:edit|update|actualiz\w*)\d*\s*[:：]/i.test(l),
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
      questionMarkTerminal,
      casualMarkerPresent,
      gpsCoordPresent,
      suspiciousTldPresent,
      englishStopwordHits,
      englishLike,
      contractionHitCount,
      contractionsPer100Words,
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
              const phrases = (r.match.phrases || []).map((p) =>
                String(p).toLowerCase(),
              );
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

      if (Number.isFinite(score.min))
        delta = Math.max(Number(score.min), delta);
      if (Number.isFinite(score.max))
        delta = Math.min(Number(score.max), delta);
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
      // Allow small negative deltas so human-ish markers can contribute to the overall/human verdict.
      ai: { score: clamp(ai.score, -5, 20), reasons: ai.reasons },
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
        pattern: "\\bas an ai\\b|\\bas an ai language model\\b",
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
        // Contractions are an English-centric feature; don't apply this rule for non-English-like text.
        { key: "englishLike", op: "eq", value: true },
        { key: "wordCount", op: "gt", value: 60 },
        // Use a rate instead of an absolute count. This avoids flagging long posts that contain
        // a couple of contractions, while still catching very formal / model-ish prose.
        { key: "contractionsPer100Words", op: "lte", value: 0.8 },
        { key: "contractionHitCount", op: "lte", value: 2 },
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
    {
      id: "ai.short_question_penalty",
      group: "ai",
      when: [
        { key: "questionMarkTerminal", op: "eq", value: true },
        { key: "wordCount", op: "lte", value: 30 },
      ],
      score: { mode: "fixed", value: -0.3 },
      reason: "short question-style message (-0.3)",
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

  /**
   * v2 training/integration helpers.
   *
   * These are NOT used by the runtime UI yet, but are exported for:
   * - offline pretraining scripts (Node)
   * - deterministic unit tests around feature extraction
   */
  const pickMlFeaturesFromText = (text) => {
    const rawOriginal = String(text ?? "");
    const f = buildTextFeatures({ rawOriginal, perUserHistory: null });

    const capNum = (v, { min = -Infinity, max = Infinity } = {}) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return clamp(n, min, max);
    };

    // IMPORTANT: keep feature magnitudes small.
    // This prevents training from producing extremely large weights (which would saturate
    // probabilities to ~0/~1 and create lots of false positives that thresholds cannot fix).
    const scale01 = (v, max) => {
      const n = capNum(v, { min: 0, max });
      if (!Number.isFinite(n) || !Number.isFinite(max) || max <= 0) return 0;
      return n / max;
    };

    const englishStyleEnabled = Boolean(f.englishLike) && f.wordCount >= 20;

    return {
      // Size/structure
      wordCount: scale01(f.wordCount, 600),
      sentenceCount: scale01(f.sentenceCount, 40),
      sentenceAvgLen: scale01(f.sentenceAvgLen, 50),
      sentenceLenVariance: scale01(f.sentenceLenVariance, 250),
      listLineCount: scale01(f.listLineCount, 30),
      mdHeadingCount: scale01(f.mdHeadingCount, 20),
      headingishLineCount: scale01(f.headingishLineCount, 20),
      revisionMarkerCount: scale01(f.revisionMarkerCount, 10),
      templateMaxRepeatCount: scale01(f.templateMaxRepeatCount, 10),

      // Artifacts
      linkCount: scale01(f.linkCount, 12),
      numberTokenCount: scale01(f.numberTokenCount, 80),
      emojiPresent: f.emojiPresent ? 1 : 0,

      // Style (may be gated later in v2)
      englishStopwordHits: scale01(f.englishStopwordHits, 80),
      englishLike: f.englishLike ? 1 : 0,
      contractionHitCount: englishStyleEnabled
        ? scale01(f.contractionHitCount, 40)
        : 0,
      contractionsPer100Words: englishStyleEnabled
        ? scale01(f.contractionsPer100Words, 20)
        : 0,

      // History (default 0 when not available). These keys are merged into the ML
      // feature vector in [`js.computeEntryBase()`](redditslopsleuth.user.js:3564).
      // Keep them bounded (or boolean) so training stays stable.
      overviewKindCommentRatio: 0,
      overviewKindPostRatio: 0,
      overviewIsCommentHeavy: 0,
      overviewIsPostHeavy: 0,
      overviewPostsPerDay01: 0,
      overviewDaysActive01: 0,
      overviewBurstiness01: 0,

      histCommentsCount: 0,
      histCommentsUniqueSubs: 0,
      histCommentsAvgWords: 0,
      histCommentsTemplateMaxRepeat: 0,
      histCommentsAvgDeltaHours: 0,
      histCommentsBurstiness01: 0,

      histSubmittedCount: 0,
      histSubmittedUniqueSubs: 0,
      histSubmittedUniqueDomains: 0,
      histSubmittedLinkRatio: 0,
      histSubmittedTitleTemplateMaxRepeat: 0,
      histSubmittedAvgDeltaHours: 0,
      histSubmittedBurstiness01: 0,

      // Context flags (so training can see what surface the text came from).
      // These are cheap and allow future per-surface calibration.
      ctxSubreddit: 0,
      ctxIsComment: 0,
      ctxIsPost: 0,
      ctxHasPostTitle: 0,
      ctxHasPermalink: 0,
    };
  };

  const RSS_TRAIN_API = {
    buildTextFeatures,
    pickMlFeaturesFromText,
    normalizeForNearDuplicate,
    normalizeLineTemplate,
    // The userscript is a single file, so offline tooling can import it and access
    // the shipped model without needing to parse source text.
    // NOTE: RSS_V2_DEFAULT_MODEL is declared later; this function is safe as long as
    // it's called after module init.
    getDefaultModel: () => RSS_V2_DEFAULT_MODEL,
  };

  // `botScore` is the bot-ish score *excluding* profile (username + botText).
  // `profileScore` is kept separate so we can show it independently and avoid double counting.
  const classify = ({ botScore, aiScore, profileScore }) => {
    const botTotal = Number(botScore) + Number(profileScore);
    const kind = (() => {
      if (botTotal >= HARD_CODED_THRESHOLDS.bot) return "bot";
      if (aiScore >= HARD_CODED_THRESHOLDS.ai) return "ai";

      const combined = botTotal + aiScore;
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

  // ------------------------------
  // v2: lightweight ML helpers
  // ------------------------------

  const RSS_V2_MODEL_STORAGE_KEY = "rss:v2:model";
  const RSS_V2_LABELS_STORAGE_KEY = "rss:v2:labels";
  const RSS_V2_MODEL_HISTORY_STORAGE_KEY = "rss:v2:modelHistory";
  const RSS_V2_OPTIONS_STORAGE_KEY = "rss:v2:options";

  // Default shipped weights (placeholder until you run offline pretraining).
  // This is intentionally conservative; it will be fine-tuned locally once label mode is used.
  const RSS_V2_DEFAULT_MODEL = {
  "version": 1,
  "kind": "logreg-binary",
  "weights": {
    "wordCount": -8.728888352441755,
    "sentenceCount": -6.559268869245881,
    "sentenceAvgLen": 0.4471703618763302,
    "sentenceLenVariance": -4.717375906637469,
    "templateMaxRepeatCount": -0.09838830423781045,
    "englishStopwordHits": 11.783979717229087,
    "englishLike": 1.5277662546201476,
    "contractionHitCount": 3.8961333511423044,
    "contractionsPer100Words": 2.99222085271706,
    "numberTokenCount": -4.588706134205937,
    "listLineCount": 7.25458343969445,
    "headingishLineCount": 11.886548163661852,
    "revisionMarkerCount": -1.1349297883433918,
    "linkCount": -3.9327375507657094,
    "emojiPresent": -2.3711457509322744,
    "overviewKindCommentRatio": -0.20971284041914576,
    "overviewKindPostRatio": -0.03995009667533234,
    "overviewIsCommentHeavy": -0.24965814335612593,
    "overviewPostsPerDay01": -0.000325235980644179,
    "overviewDaysActive01": -0.33300538037174654,
    "histCount": -6.24145358390315,
    "histUniqueSubs": -2.746239576917384,
    "histUniqueDomains": -0.7489744300683782,
    "histLinkRatio": -0.03995009667533234,
    "histAvgDeltaHours": -76.66638653498974,
    "mdHeadingCount": -0.06148241037372616
  },
  "bias": -3.380431627637778
};

  const RSS_V2_THRESHOLDS = {
    // If the per-item ML probability is above this, we allow the badge to become 🧠.
    // Tuned to reduce false positives (precision-first).
    itemAi: 0.84,
    // Only applied once we've seen multiple entries for a user (see finalizeEntryClassification()).
    userAi: 0.8,
    // If both item and user are confidently low, allow ✅ (still requires "not bot-ish" and decent profile).
    human: 0.2,
  };

  const RSS_V2_TELEMETRY_KEY = "rss:v2:telemetry";
  const RSS_V2_TRAIN_DATA_STORAGE_KEY = "rss:v2:train-data";
  const RSS_V2_TRAIN_PERSIST_MAX = 800;
  const RSS_V2_TRAIN_PERSIST_DEDUPE_WINDOW = 200;
  const RSS_V2_TRAIN_TEXT_MAX = 1200;

  const rssSigmoid = (z) => 1 / (1 + Math.exp(-z));

  const rssDot = (w, x) => {
    let s = 0;
    for (const [k, v] of Object.entries(x || {})) {
      const vv = Number(v);
      if (!Number.isFinite(vv) || vv === 0) continue;
      s += (Number(w?.[k] ?? 0) || 0) * vv;
    }
    return s;
  };

  const rssPredictAiProba = (model, features) => {
    const z =
      rssDot(model?.weights || {}, features || {}) +
      (Number(model?.bias ?? 0) || 0);
    const p = rssSigmoid(z);
    if (!Number.isFinite(p)) return 0.5;
    return clamp(p, 0, 1);
  };

  const rssTopContribs = (model, features, n = 8) => {
    const pairs = [];
    for (const [k, v] of Object.entries(features || {})) {
      const vv = Number(v);
      if (!Number.isFinite(vv) || vv === 0) continue;
      const w = Number(model?.weights?.[k] ?? 0) || 0;
      const c = w * vv;
      if (!Number.isFinite(c) || c === 0) continue;
      pairs.push([k, c, vv, w]);
    }
    pairs.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return pairs
      .slice(0, n)
      .map(([k, c, vv, w]) => ({ key: k, contrib: c, value: vv, weight: w }));
  };

  const rssTrainStep = (
    model,
    features,
    yBool,
    { lr = 0.06, l2 = 1e-4 } = {},
  ) => {
    const y = yBool ? 1 : 0;
    const weights = { ...(model?.weights || {}) };
    let bias = Number(model?.bias ?? 0) || 0;

    const p = rssPredictAiProba({ weights, bias }, features);
    const err = p - y;

    bias -= lr * err;

    for (const [k, v] of Object.entries(features || {})) {
      const vv = Number(v);
      if (!Number.isFinite(vv) || vv === 0) continue;
      const wk = Number(weights[k] ?? 0) || 0;
      const grad = err * vv + l2 * wk;
      weights[k] = wk - lr * grad;
    }

    return {
      ...model,
      kind: "logreg-binary",
      version: Number(model?.version ?? 1) || 1,
      weights,
      bias,
      updatedAt: Date.now(),
    };
  };

  const rssLoadJson = (win, key) => {
    const tryLoad = (store) => {
      try {
        const raw = store?.getItem?.(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    // Prefer localStorage (survives restarts), but fall back to sessionStorage in
    // environments where localStorage is blocked or quota-limited.
    const fromLocal = tryLoad(win?.localStorage);
    if (fromLocal !== null) return fromLocal;
    return tryLoad(win?.sessionStorage);
  };

  const rssSaveJson = (win, key, value) => {
    const payload = JSON.stringify(value);

    const trySave = (store) => {
      try {
        store?.setItem?.(key, payload);
        return true;
      } catch {
        return false;
      }
    };

    // Prefer localStorage; fall back to sessionStorage.
    if (trySave(win?.localStorage)) return true;
    return trySave(win?.sessionStorage);
  };

  const rssLoadModel = (win) => {
    const stored = rssLoadJson(win, RSS_V2_MODEL_STORAGE_KEY);
    if (stored && stored.kind === "logreg-binary" && stored.weights)
      return stored;
    return RSS_V2_DEFAULT_MODEL;
  };

  const rssLoadLabels = (win) => {
    const stored = rssLoadJson(win, RSS_V2_LABELS_STORAGE_KEY);
    if (stored && typeof stored === "object") return stored;
    return { version: 1, records: [] };
  };

  const rssLoadModelHistory = (win) => {
    const stored = rssLoadJson(win, RSS_V2_MODEL_HISTORY_STORAGE_KEY);
    if (Array.isArray(stored)) return stored;
    if (stored && Array.isArray(stored.records)) return stored.records;
    return [];
  };

  const rssLoadOptions = (win) => {
    const stored = rssLoadJson(win, RSS_V2_OPTIONS_STORAGE_KEY);
    return stored && typeof stored === "object" ? stored : {};
  };

  const rssSaveOptions = (win, options) => {
    return rssSaveJson(win, RSS_V2_OPTIONS_STORAGE_KEY, {
      version: 1,
      updatedAt: Date.now(),
      options,
    });
  };

  const rssLoadTrainData = (win) => {
    const stored = rssLoadJson(win, RSS_V2_TRAIN_DATA_STORAGE_KEY);
    if (Array.isArray(stored)) return stored;
    if (stored && Array.isArray(stored.records)) return stored.records;
    return [];
  };

  const rssSaveTrainData = (win, records) => {
    return rssSaveJson(win, RSS_V2_TRAIN_DATA_STORAGE_KEY, {
      version: 1,
      updatedAt: Date.now(),
      records,
    });
  };

  const rssTrainRowSig = (row) => {
    const url = String(row?.url || "");
    const username = String(row?.username || "");
    const entryId = String(row?.entryId || row?.context?.permalink || "");
    const text = compactWs(String(row?.text || "")).slice(0, 160);
    return `${url}|${username}|${entryId}|${text}`;
  };

  const rssCompactNumberMap = (raw) => {
    const src =
      raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
      if (!Number.isFinite(n) || n === 0) continue;
      out[k] = n;
    }
    return out;
  };

  const rssMakeTrainPersistRow = (row) => {
    const safe = row && typeof row === "object" ? row : {};
    const text = String(safe.text || "").slice(0, RSS_V2_TRAIN_TEXT_MAX);
    return {
      kind: "rss-train-data",
      url: String(safe.url || ""),
      username: String(safe.username || ""),
      entryId: safe.entryId ?? null,
      context: safe.context ?? null,
      text,
      features: rssCompactNumberMap(safe.features),
    };
  };

  const createRedditSlopSleuth = ({ win, doc, fetchFn, options = {} }) => {
    const storedV2Options = (() => {
      try {
        const s = rssLoadOptions(win);
        return s && typeof s === "object" ? s.options || {} : {};
      } catch {
        return {};
      }
    })();

    const v2Options = {
      // Extra Reddit JSON fetches are implemented later in v2; keep the flag here so tests and
      // users can control behavior deterministically.
      enableHistoryFetch: true,
      // Extended history fetches can be noisy/expensive (extra quota and more JSON).
      // Keep them opt-in until we ship pretrained weights that actually use these features.
      enableExtendedHistoryFetch: false,
      historyDailyQuotaPerUser: 4,
      ...(storedV2Options || {}),
      ...(options?.v2 || {}),
    };

    // If the shipped model starts using extended-history features, enable them by default.
    // This preserves backwards behavior (still opt-in) until a pretrained model actually benefits.
    try {
      const w = RSS_V2_DEFAULT_MODEL?.weights || {};
      const usesExtendedHistory = [
        "histCommentsCount",
        "histCommentsAvgDeltaHours",
        "histCommentsTemplateMaxRepeat",
        "histCommentsBurstiness01",
        "histSubmittedCount",
        "histSubmittedAvgDeltaHours",
        "histSubmittedTitleTemplateMaxRepeat",
        "histSubmittedBurstiness01",
      ].some((k) => Number(w?.[k] || 0) !== 0);
      if (usesExtendedHistory && typeof options?.v2?.enableExtendedHistoryFetch !== "boolean") {
        v2Options.enableExtendedHistoryFetch = true;
      }
    } catch {
      // Ignore.
    }

    const state = {
      open: false,
      selectedEntryId: null,
      activePopoverEntryId: null,
      popoverHideTimer: null,
      globalBadgeHandlersAttached: false,
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

      historyCache: new Map(), // key -> { fetchedAt, data, promise, error }
      userHistoryFeatures: new Map(), // username -> features
      userHistoryLevel: new Map(), // username -> 0 (none) | 1 (overview) | 2 (overview+comments+submitted)
      historyQueue: Promise.resolve(),
      nextHistoryFetchAt: 0,

      // v2: label + model state
      v2Model: rssLoadModel(win),
      v2Labels: rssLoadLabels(win),
      v2ModelHistory: rssLoadModelHistory(win),
      v2UserAgg: new Map(), // username -> { n, meanPAi }
      v2UserLabel: new Map(), // username -> "human" | "ai"
      v2TrainBuffer: [], // last N entries for console export
      v2TrainPersisted: rssLoadTrainData(win), // persisted across navigations
      v2TrainPersistErrorCount: 0,
      v2TrainPersistLastErrorAt: 0,

      v2Options,
    };

    const extractEntryContext = (element) => {
      const url = String(win?.location?.href || "");
      const path = String(win?.location?.pathname || "");

      const subreddit =
        parseSubredditFromUrl(path) ||
        parseSubredditFromUrl(url) ||
        (() => {
          try {
            const a = element?.querySelector?.(
              'a[href^="/r/"], a[href*="/r/"]',
            );
            return parseSubredditFromUrl(a?.getAttribute?.("href") || "");
          } catch {
            return "";
          }
        })();

      const postTitle = (() => {
        try {
          const t =
            element?.querySelector?.(
              'h1, h2, [data-testid="post-title"], [slot="title"]',
            ) ||
            doc?.querySelector?.(
              'h1, [data-testid="post-title"], [slot="title"]',
            );
          return compactWs(safeText(t)).slice(0, 240);
        } catch {
          return "";
        }
      })();

      const permalink = (() => {
        try {
          const a = element?.querySelector?.(
            'a[href*="/comments/"], a[data-click-id="comments"], a[data-testid="comments-link"]',
          );
          return String(a?.getAttribute?.("href") || "");
        } catch {
          return "";
        }
      })();

      const kind = (() => {
        try {
          if (
            element?.matches?.('div[data-testid="comment"], shreddit-comment')
          )
            return "comment";
          if (
            element?.matches?.(
              'article, shreddit-post, div[data-testid="post-container"], div.link',
            )
          )
            return "post";
        } catch {
          // Ignore.
        }
        return "unknown";
      })();

      return {
        url,
        subreddit: subreddit || null,
        postTitle: postTitle || null,
        permalink: permalink || null,
        kind,
      };
    };

    // Hydrate per-user label priors from stored label records.
    try {
      const recs = Array.isArray(state.v2Labels?.records)
        ? state.v2Labels.records
        : [];
      for (const r of recs) {
        if (r?.kind !== "user") continue;
        const u = normalizeUsername(r.username);
        const label =
          r.label === "ai" ? "ai" : r.label === "human" ? "human" : null;
        if (u && label) state.v2UserLabel.set(u, label);
      }
    } catch {
      // Ignore.
    }

    const v2SaveModel = () =>
      rssSaveJson(win, RSS_V2_MODEL_STORAGE_KEY, state.v2Model);
    const v2SaveLabels = () =>
      rssSaveJson(win, RSS_V2_LABELS_STORAGE_KEY, state.v2Labels);
    const v2SaveModelHistory = () =>
      rssSaveJson(win, RSS_V2_MODEL_HISTORY_STORAGE_KEY, state.v2ModelHistory);

    const v2GetStorageKind = () => {
      try {
        // If localStorage is writable, prefer it.
        const k = "rss:probe";
        win?.localStorage?.setItem?.(k, "1");
        win?.localStorage?.removeItem?.(k);
        return "localStorage";
      } catch {
        return "sessionStorage";
      }
    };

    const v2SaveTrainData = () =>
      rssSaveTrainData(
        win,
        Array.isArray(state.v2TrainPersisted) ? state.v2TrainPersisted : [],
      );

    const v2SaveOptions = () => {
      try {
        rssSaveOptions(win, state.v2Options);
      } catch {
        // Ignore.
      }
    };

    const v2PushModelSnapshot = () => {
      try {
        state.v2ModelHistory = Array.isArray(state.v2ModelHistory)
          ? state.v2ModelHistory
          : [];
        state.v2ModelHistory.push({ ...state.v2Model, ts: Date.now() });
        if (state.v2ModelHistory.length > 40)
          state.v2ModelHistory = state.v2ModelHistory.slice(-30);
        v2SaveModelHistory();
      } catch {
        // Ignore.
      }
    };

    const v2UndoLastTune = async () => {
      state.v2ModelHistory = Array.isArray(state.v2ModelHistory)
        ? state.v2ModelHistory
        : [];
      const prev = state.v2ModelHistory.pop();
      if (!prev) return false;
      // Strip helper fields that may have been added.
      const restored = {
        version: Number(prev.version ?? 1) || 1,
        kind: "logreg-binary",
        weights: prev.weights || {},
        bias: Number(prev.bias ?? 0) || 0,
        updatedAt: Date.now(),
      };
      state.v2Model = restored;
      v2SaveModel();
      v2SaveModelHistory();
      await refreshAllBadges();
      state.ui?.render?.();
      return true;
    };

    const v2AddLabelRecord = (rec) => {
      state.v2Labels.records = Array.isArray(state.v2Labels.records)
        ? state.v2Labels.records
        : [];
      state.v2Labels.records.push({ ...rec, ts: Date.now() });
      // Bound storage.
      if (state.v2Labels.records.length > 4000) {
        state.v2Labels.records = state.v2Labels.records.slice(-3000);
      }

      // Keep an in-memory map of the latest per-user label.
      if (rec?.kind === "user") {
        const u = normalizeUsername(rec.username);
        const label =
          rec.label === "ai" ? "ai" : rec.label === "human" ? "human" : null;
        if (u && label) state.v2UserLabel.set(u, label);
      }

      v2SaveLabels();
    };

    const v2RememberTrainRow = (row) => {
      state.v2TrainBuffer.push(row);
      if (state.v2TrainBuffer.length > 200)
        state.v2TrainBuffer = state.v2TrainBuffer.slice(-150);

      // Persist across navigations (so you can browse many pages and export later).
      try {
        const next = Array.isArray(state.v2TrainPersisted)
          ? state.v2TrainPersisted
          : [];

        const persistRow = rssMakeTrainPersistRow(row);

        const sig = rssTrainRowSig(persistRow);
        const recent = next.slice(-RSS_V2_TRAIN_PERSIST_DEDUPE_WINDOW);
        if (recent.some((r) => rssTrainRowSig(r) === sig)) return;

        next.push({ ...persistRow, ts: Date.now() });
        state.v2TrainPersisted =
          next.length > RSS_V2_TRAIN_PERSIST_MAX
            ? next.slice(-RSS_V2_TRAIN_PERSIST_MAX)
            : next;

        const ok = v2SaveTrainData();
        if (!ok) {
          state.v2TrainPersistErrorCount += 1;
          state.v2TrainPersistLastErrorAt = Date.now();
          // Retry once with a smaller window in case we hit storage limits.
          state.v2TrainPersisted = state.v2TrainPersisted.slice(-120);
          v2SaveTrainData();
        }
      } catch {
        // Ignore quota/private mode.
      }
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
        const raw = win?.localStorage?.getItem?.(
          `${PROFILE_STORAGE_PREFIX}${username}`,
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const fetchedAt = Number(parsed.fetchedAt);
        if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;

        const age = Date.now() - fetchedAt;
        if (parsed.status === "ok") {
          if (age < PROFILE_CACHE_TTL_MS)
            return { status: "ok", data: parsed.data ?? null, fetchedAt };
          return null;
        }

        if (parsed.status === "fail") {
          if (age < PROFILE_FAILURE_TTL_MS)
            return { status: "fail", data: null, fetchedAt };
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
          JSON.stringify(payload),
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
            state.ratelimitedUntil,
          );
        }
      });
      return state.profileQueue;
    };

    const todayKey = () => {
      const d = new Date();
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    };

    const readStoredHistory = (username, endpoint) => {
      try {
        const key = `${HISTORY_STORAGE_PREFIX}${username}:${endpoint}`;
        const raw = win?.localStorage?.getItem?.(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const fetchedAt = Number(parsed?.fetchedAt);
        if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
        const age = Date.now() - fetchedAt;
        if (parsed.status === "ok") {
          if (age < HISTORY_CACHE_TTL_MS)
            return { status: "ok", data: parsed.data ?? null, fetchedAt };
          return null;
        }
        if (parsed.status === "fail") {
          if (age < HISTORY_FAILURE_TTL_MS)
            return { status: "fail", data: null, fetchedAt };
          return null;
        }
      } catch {
        return null;
      }
      return null;
    };

    const writeStoredHistory = (username, endpoint, payload) => {
      try {
        const key = `${HISTORY_STORAGE_PREFIX}${username}:${endpoint}`;
        win?.localStorage?.setItem?.(key, JSON.stringify(payload));
      } catch {
        // Ignore.
      }
    };

    const bumpHistoryQuota = (username) => {
      try {
        const day = todayKey();
        const key = `${HISTORY_STORAGE_PREFIX}quota:${day}:${username}`;
        const n = Number(win?.localStorage?.getItem?.(key) || 0) || 0;
        const next = n + 1;
        win?.localStorage?.setItem?.(key, String(next));
        return next;
      } catch {
        return 999;
      }
    };

    const getHistoryQuota = (username) => {
      try {
        const day = todayKey();
        const key = `${HISTORY_STORAGE_PREFIX}quota:${day}:${username}`;
        return Number(win?.localStorage?.getItem?.(key) || 0) || 0;
      } catch {
        return 0;
      }
    };

    const historyQueueFetch = async (fn) => {
      state.historyQueue = state.historyQueue.then(async () => {
        const now = Date.now();
        const gate = Math.max(state.nextHistoryFetchAt, state.ratelimitedUntil);
        const waitMs = Math.max(0, gate - now);
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        try {
          return await fn();
        } finally {
          state.nextHistoryFetchAt = Math.max(
            Date.now() + HISTORY_MIN_INTERVAL_MS,
            state.ratelimitedUntil,
          );
        }
      });
      return state.historyQueue;
    };

    const safeDomainFromUrl = (rawUrl) => {
      try {
        const u = new URL(
          String(rawUrl || ""),
          win?.location?.origin || "https://www.reddit.com",
        );
        return u.hostname || "";
      } catch {
        return "";
      }
    };

    const computeOverviewHistoryFeatures = (overviewJson) => {
      const children = overviewJson?.data?.children || [];
      const items = children.map((c) => c?.data).filter(Boolean);
      const created = items
        .map((i) => Number(i.created_utc))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      const computeBurstiness01FromCreated = (createdUtcSeconds) => {
        const createdSorted = (createdUtcSeconds || [])
          .map((t) => Number(t))
          .filter(Number.isFinite)
          .sort((a, b) => a - b);
        if (createdSorted.length < 6) return 0;

        // Use a quantile ratio: if the fastest gaps are much smaller than the median gap,
        // posting is bursty. This is robust to overall activity level.
        const gaps = [];
        for (let i = 1; i < createdSorted.length; i += 1) {
          const d = createdSorted[i] - createdSorted[i - 1];
          if (Number.isFinite(d) && d > 0) gaps.push(d);
        }
        if (gaps.length < 5) return 0;

        gaps.sort((a, b) => a - b);
        const q = (qq) => gaps[Math.floor((gaps.length - 1) * qq)] || 0;
        const p10 = q(0.1);
        const p50 = q(0.5);
        if (!Number.isFinite(p10) || !Number.isFinite(p50) || p10 <= 0 || p50 <= 0)
          return 0;

        // If p10 << p50 => bursty. Map ratio into 0..1.
        const ratio = p50 / p10;
        return clamp((ratio - 1) / 9, 0, 1); // ratio 1..10+ => 0..1
      };

      const subreddits = new Set(
        items
          .map((i) => String(i.subreddit || "").toLowerCase())
          .filter(Boolean),
      );
      const domains = new Set(
        items
          .map((i) =>
            safeDomainFromUrl(i.url || i.link_url || i.permalink || ""),
          )
          .map((d) => d.toLowerCase())
          .filter(Boolean),
      );

      const linkPosts = items.filter(
        (i) => typeof i.url === "string" && /^https?:\/\//i.test(i.url),
      ).length;
      const total = items.length;
      const linkRatio = total > 0 ? linkPosts / total : 0;

      // Mix / cadence (language-agnostic)
      // NOTE: `overviewJson.data.children[].kind` is typically: t1 (comment), t3 (post)
      const kindCommentCount = children.filter((c) => c?.kind === "t1").length;
      const kindPostCount = children.filter((c) => c?.kind === "t3").length;
      const kindTotal = Math.max(1, kindCommentCount + kindPostCount);
      const overviewKindCommentRatio = kindCommentCount / kindTotal;
      const overviewKindPostRatio = kindPostCount / kindTotal;

      // Days active: coarse span between oldest and newest items in the listing.
      const spanDays =
        created.length >= 2
          ? Math.max(0.25, (created[created.length - 1] - created[0]) / 86400)
          : 0.25;
      const postsPerDay = kindPostCount / spanDays;
      const overviewPostsPerDay01 = clamp(postsPerDay / 10, 0, 1);
      const overviewDaysActive01 = clamp(spanDays / 60, 0, 1);

      const avgDeltaHours = (() => {
        if (created.length < 2) return 0;
        let sum = 0;
        for (let i = 1; i < created.length; i += 1)
          sum += created[i] - created[i - 1];
        return sum / (created.length - 1) / 3600;
      })();

      const overviewBurstiness01 = computeBurstiness01FromCreated(created);

      return {
        histCount: total,
        histUniqueSubs: subreddits.size,
        histUniqueDomains: domains.size,
        histLinkRatio: Number.isFinite(linkRatio) ? linkRatio : 0,
        histAvgDeltaHours: Number.isFinite(avgDeltaHours) ? avgDeltaHours : 0,
        // Mix / cadence (language-agnostic)
        overviewKindCommentRatio,
        overviewKindPostRatio,
        overviewIsCommentHeavy: overviewKindCommentRatio >= 0.8 ? 1 : 0,
        overviewIsPostHeavy: overviewKindPostRatio >= 0.8 ? 1 : 0,
        // Activity/age proxies (bounded)
        overviewPostsPerDay01,
        overviewDaysActive01,
        overviewBurstiness01,
      };
    };

    const computeCommentsHistoryFeatures = (commentsJson) => {
      const children = commentsJson?.data?.children || [];
      const items = children.map((c) => c?.data).filter(Boolean);

      const subreddits = new Set(
        items
          .map((i) => String(i.subreddit || "").toLowerCase())
          .filter(Boolean),
      );
      const created = items
        .map((i) => Number(i.created_utc))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      const bodies = items.map((i) => String(i.body || "")).filter(Boolean);
      const bodyLens = bodies.map(
        (b) => compactWs(b).split(/\s+/).filter(Boolean).length,
      );
      const bodyAvgWords = bodyLens.length
        ? bodyLens.reduce((a, b) => a + b, 0) / bodyLens.length
        : 0;

      const templateMaxRepeat = (() => {
        const counts = new Map();
        for (const b of bodies) {
          const norm = normalizeForNearDuplicate(b);
          if (!norm || norm.split(/\s+/).length < 6) continue;
          counts.set(norm, (counts.get(norm) || 0) + 1);
        }
        return Math.max(0, ...counts.values());
      })();

      const avgDeltaHours = (() => {
        if (created.length < 2) return 0;
        let sum = 0;
        for (let i = 1; i < created.length; i += 1)
          sum += created[i] - created[i - 1];
        return sum / (created.length - 1) / 3600;
      })();

      // Burstiness for comments (same quantile-ratio approach as overview)
      const histCommentsBurstiness01 = (() => {
        if (created.length < 6) return 0;
        const gaps = [];
        for (let i = 1; i < created.length; i += 1) {
          const d = created[i] - created[i - 1];
          if (Number.isFinite(d) && d > 0) gaps.push(d);
        }
        if (gaps.length < 5) return 0;
        gaps.sort((a, b) => a - b);
        const q = (qq) => gaps[Math.floor((gaps.length - 1) * qq)] || 0;
        const p10 = q(0.1);
        const p50 = q(0.5);
        if (!Number.isFinite(p10) || !Number.isFinite(p50) || p10 <= 0 || p50 <= 0)
          return 0;
        const ratio = p50 / p10;
        return clamp((ratio - 1) / 9, 0, 1);
      })();

      return {
        histCommentsCount: items.length,
        histCommentsUniqueSubs: subreddits.size,
        histCommentsAvgWords: Number.isFinite(bodyAvgWords) ? bodyAvgWords : 0,
        histCommentsTemplateMaxRepeat: templateMaxRepeat,
        histCommentsAvgDeltaHours: Number.isFinite(avgDeltaHours)
          ? avgDeltaHours
          : 0,
        histCommentsBurstiness01,
      };
    };

    const computeSubmittedHistoryFeatures = (submittedJson) => {
      const children = submittedJson?.data?.children || [];
      const items = children.map((c) => c?.data).filter(Boolean);

      const subreddits = new Set(
        items
          .map((i) => String(i.subreddit || "").toLowerCase())
          .filter(Boolean),
      );
      const domains = new Set(
        items
          .map((i) =>
            safeDomainFromUrl(i.url || i.link_url || i.permalink || ""),
          )
          .map((d) => d.toLowerCase())
          .filter(Boolean),
      );

      const created = items
        .map((i) => Number(i.created_utc))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      const titles = items.map((i) => String(i.title || "")).filter(Boolean);
      const titleTemplateMaxRepeat = (() => {
        const counts = new Map();
        for (const t of titles) {
          const norm = normalizeForNearDuplicate(t);
          if (!norm || norm.split(/\s+/).length < 4) continue;
          counts.set(norm, (counts.get(norm) || 0) + 1);
        }
        return Math.max(0, ...counts.values());
      })();

      const linkPosts = items.filter(
        (i) => typeof i.url === "string" && /^https?:\/\//i.test(i.url),
      ).length;
      const total = items.length;
      const linkRatio = total > 0 ? linkPosts / total : 0;

      const avgDeltaHours = (() => {
        if (created.length < 2) return 0;
        let sum = 0;
        for (let i = 1; i < created.length; i += 1)
          sum += created[i] - created[i - 1];
        return sum / (created.length - 1) / 3600;
      })();

      const histSubmittedBurstiness01 = (() => {
        if (created.length < 6) return 0;
        const gaps = [];
        for (let i = 1; i < created.length; i += 1) {
          const d = created[i] - created[i - 1];
          if (Number.isFinite(d) && d > 0) gaps.push(d);
        }
        if (gaps.length < 5) return 0;
        gaps.sort((a, b) => a - b);
        const q = (qq) => gaps[Math.floor((gaps.length - 1) * qq)] || 0;
        const p10 = q(0.1);
        const p50 = q(0.5);
        if (!Number.isFinite(p10) || !Number.isFinite(p50) || p10 <= 0 || p50 <= 0)
          return 0;
        const ratio = p50 / p10;
        return clamp((ratio - 1) / 9, 0, 1);
      })();

      return {
        histSubmittedCount: total,
        histSubmittedUniqueSubs: subreddits.size,
        histSubmittedUniqueDomains: domains.size,
        histSubmittedLinkRatio: Number.isFinite(linkRatio) ? linkRatio : 0,
        histSubmittedTitleTemplateMaxRepeat: titleTemplateMaxRepeat,
        histSubmittedAvgDeltaHours: Number.isFinite(avgDeltaHours)
          ? avgDeltaHours
          : 0,
        histSubmittedBurstiness01,
      };
    };

    const getUserListingJson = async (username, endpoint, url) => {
      const u = normalizeUsername(username);
      if (!u) return null;

      const stored = readStoredHistory(u, endpoint);
      if (stored?.status === "ok") return stored.data || null;
      if (stored?.status === "fail") return null;

      const cacheKey = `${u}:${endpoint}`;
      const cached = state.historyCache.get(cacheKey);
      if (cached) {
        const age = Date.now() - cached.fetchedAt;
        if (cached.data && age < HISTORY_CACHE_TTL_MS) return cached.data;
        if (cached.error && age < HISTORY_FAILURE_TTL_MS) return null;
        if (cached.promise) return cached.promise;
      }

      if (!state.v2Options.enableHistoryFetch) return null;
      if (
        getHistoryQuota(u) >=
        Number(state.v2Options.historyDailyQuotaPerUser || 0)
      )
        return null;

      const promise = historyQueueFetch(async () => {
        try {
          bumpHistoryQuota(u);
          const res = await fetchFn(url, { credentials: "include" });

          if (res.status === 429) {
            const resetSeconds = safeHeaderNumber(
              res.headers,
              "x-ratelimit-reset",
            );
            const backoffMs = (resetSeconds ?? 120) * 1000;
            state.ratelimitedUntil = Math.max(
              state.ratelimitedUntil,
              Date.now() + backoffMs,
            );
            state.historyCache.set(cacheKey, {
              fetchedAt: Date.now(),
              data: null,
              promise: null,
              error: true,
            });
            writeStoredHistory(u, endpoint, {
              status: "fail",
              fetchedAt: Date.now(),
            });
            return null;
          }

          if (!res.ok) throw new Error(`${endpoint}.json HTTP ${res.status}`);
          const json = await res.json();
          state.historyCache.set(cacheKey, {
            fetchedAt: Date.now(),
            data: json,
            promise: null,
            error: false,
          });
          writeStoredHistory(u, endpoint, {
            status: "ok",
            fetchedAt: Date.now(),
            data: json,
          });
          return json;
        } catch {
          state.historyCache.set(cacheKey, {
            fetchedAt: Date.now(),
            data: null,
            promise: null,
            error: true,
          });
          writeStoredHistory(u, endpoint, {
            status: "fail",
            fetchedAt: Date.now(),
          });
          return null;
        }
      });

      state.historyCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data: null,
        promise,
        error: false,
      });
      return promise;
    };

    const getUserOverviewJson = async (username) => {
      const u = normalizeUsername(username);
      if (!u) return null;
      const endpoint = "overview";
      const url = `/user/${encodeURIComponent(u)}/overview.json?limit=25`;
      return getUserListingJson(u, endpoint, url);
    };

    const getUserCommentsJson = async (username) => {
      const u = normalizeUsername(username);
      if (!u) return null;
      const endpoint = "comments";
      const url = `/user/${encodeURIComponent(u)}/comments.json?limit=50`;
      return getUserListingJson(u, endpoint, url);
    };

    const getUserSubmittedJson = async (username) => {
      const u = normalizeUsername(username);
      if (!u) return null;
      const endpoint = "submitted";
      const url = `/user/${encodeURIComponent(u)}/submitted.json?limit=50`;
      return getUserListingJson(u, endpoint, url);
    };

    const ensureUserHistoryFeatures = async (username, { level = 1 } = {}) => {
      const u = normalizeUsername(username);
      if (!u) return null;

      const existingLevel = state.userHistoryLevel.get(u) || 0;
      const existing = state.userHistoryFeatures.get(u) || null;
      if (existing && existingLevel >= level) return existing;

      // Always start with overview.
      const out = { ...(existing || {}) };
      const overview = await getUserOverviewJson(u);
      if (overview)
        Object.assign(out, computeOverviewHistoryFeatures(overview));
      state.userHistoryLevel.set(u, Math.max(existingLevel, 1));

      // Optional extended endpoints.
      if (level >= 2 && state.v2Options.enableExtendedHistoryFetch) {
        const comments = await getUserCommentsJson(u);
        if (comments)
          Object.assign(out, computeCommentsHistoryFeatures(comments));
        const submitted = await getUserSubmittedJson(u);
        if (submitted)
          Object.assign(out, computeSubmittedHistoryFeatures(submitted));
        state.userHistoryLevel.set(
          u,
          Math.max(state.userHistoryLevel.get(u) || 0, 2),
        );
      }

      // If we got nothing useful, don't cache.
      if (!Object.keys(out).length) return null;
      state.userHistoryFeatures.set(u, out);
      return out;
    };

    // Note: v2 may refresh a user's badges after history fetch, but we avoid doing that inside
    // `computeEntry()` to prevent recursive recomputation.
    //
    // IMPORTANT: recomputation must be idempotent. Some text rules (like per-user near-duplicate)
    // intentionally mutate per-user history state. If we re-score entries without rebuilding that
    // state from scratch, a single entry can incorrectly become its own "duplicate".
    const refreshBadgesForUser = async (username) => {
      const u = normalizeUsername(username);
      if (!u) return;

      // Rebuild per-user aggregates/history for this user only.
      state.v2UserAgg.delete(u);
      state.perUserHistory.delete(u);

      for (const entry of state.entries.values()) {
        if (entry.username !== u) continue;

        const computed = await computeEntry({
          element: entry.element,
          authorEl: entry.authorEl,
          username: entry.username,
          text: entry.text,
        });
        entry.scores = computed.scores;
        entry.reasons = computed.reasons;
        entry.classification = computed.classification;
        entry.ml = computed.ml;

        const badges = state.badgeByUsername.get(entry.username);
        if (badges) {
          for (const badgeEl of badges) {
            if (badgeEl.getAttribute(ENTRY_ID_ATTR) !== entry.id) continue;
            badgeEl.textContent = entry.classification.emoji;
            badgeEl.setAttribute("data-rss-kind", entry.classification.kind);
          }
        }
      }
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
          const res = await fetchFn(
            `/user/${encodeURIComponent(u)}/about.json`,
            {
              credentials: "include",
            },
          );

          // Respect Reddit rate limiting.
          if (res.status === 429) {
            const resetSeconds = safeHeaderNumber(
              res.headers,
              "x-ratelimit-reset",
            );
            const backoffMs = (resetSeconds ?? 120) * 1000;
            state.ratelimitedUntil = Math.max(
              state.ratelimitedUntil,
              Date.now() + backoffMs,
            );

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
          const remaining = safeHeaderNumber(
            res.headers,
            "x-ratelimit-remaining",
          );
          const resetSeconds = safeHeaderNumber(
            res.headers,
            "x-ratelimit-reset",
          );
          if (remaining !== null && remaining <= 2 && resetSeconds !== null) {
            state.ratelimitedUntil = Math.max(
              state.ratelimitedUntil,
              Date.now() + resetSeconds * 1000,
            );
          }

          const json = await res.json();
          const data = json?.data;
          state.profileCache.set(u, {
            fetchedAt: Date.now(),
            data,
            promise: null,
            error: false,
          });
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

      state.profileCache.set(u, {
        fetchedAt: Date.now(),
        data: null,
        promise,
        error: false,
      });
      return promise;
    };

    const buildUi = () => {
      if (state.ui) return state.ui;

      const root = doc.createElement("div");
      root.id = UI_ROOT_ID;
      root.className = "rss-fixed rss-bottom-4 rss-right-4";

      const gearBtn = doc.createElement("button");
      gearBtn.className =
        "rss-gear rss-select-none rss-cursor-pointer rss-focus-ring";
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
        for (const e of state.entries.values())
          counts[e.classification.kind] += 1;

        drawer.innerHTML = "";

        const header = doc.createElement("div");
        header.className =
          "rss-flex rss-justify-between rss-items-center rss-p-4";
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
        body.className =
          "rss-p-4 rss-flex rss-flex-col rss-gap-3 rss-overflow-auto rss-max-h-80vh";

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
          pills.appendChild(
            pill(
              "Bot",
              fmtThresholdProgress(
                selected.scores.bot,
                HARD_CODED_THRESHOLDS.bot,
              ),
            ),
          );
          pills.appendChild(
            pill(
              "AI",
              fmtThresholdProgress(
                selected.scores.ai,
                HARD_CODED_THRESHOLDS.ai,
              ),
            ),
          );
          pills.appendChild(
            pill(
              "Profile",
              fmtScore(selected.scores.profile, { signed: true }),
            ),
          );
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

          const botRatio = ratioToThreshold(
            selected.scores.bot,
            HARD_CODED_THRESHOLDS.bot,
          );
          const aiRatio = ratioToThreshold(
            selected.scores.ai,
            HARD_CODED_THRESHOLDS.ai,
          );
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
            })(),
          );

          meters.appendChild(
            makeMeter({
              label: "Bot",
              value: selected.scores.bot,
              threshold: HARD_CODED_THRESHOLDS.bot,
              meterKind: "bot",
            }),
          );
          meters.appendChild(
            makeMeter({
              label: "AI",
              value: selected.scores.ai,
              threshold: HARD_CODED_THRESHOLDS.ai,
              meterKind: "ai",
            }),
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
            selected.element?.scrollIntoView?.({
              behavior: "smooth",
              block: "center",
            });
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
              e.element?.scrollIntoView?.({
                behavior: "smooth",
                block: "center",
              });
            });
            listBody.appendChild(row);
          }
        }
        list.appendChild(listBody);

        const v2Panel = doc.createElement("div");
        v2Panel.className = "rss-row";

        const labelCounts = (() => {
          const c = {
            itemHuman: 0,
            itemAi: 0,
            userHuman: 0,
            userAi: 0,
          };
          const recs = Array.isArray(state.v2Labels?.records)
            ? state.v2Labels.records
            : [];
          for (const r of recs) {
            if (r?.kind === "item") {
              if (r.label === "human") c.itemHuman += 1;
              else if (r.label === "ai") c.itemAi += 1;
            }
            if (r?.kind === "user") {
              if (r.label === "human") c.userHuman += 1;
              else if (r.label === "ai") c.userAi += 1;
            }
          }
          return c;
        })();

        const topWeights = (() => {
          const w = state.v2Model?.weights || {};
          const pairs = Object.entries(w)
            .map(([k, v]) => [k, Number(v)])
            .filter(([, v]) => Number.isFinite(v) && v !== 0);
          pairs.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
          return pairs.slice(0, 10);
        })();

        const modelUpdatedAt = (() => {
          const ts = Number(state.v2Model?.updatedAt);
          if (!Number.isFinite(ts) || ts <= 0) return "(shipped default)";
          try {
            return new Date(ts).toISOString();
          } catch {
            return String(ts);
          }
        })();

        const evalSummary = (() => {
          const recs = Array.isArray(state.v2Labels?.records)
            ? state.v2Labels.records
            : [];
          const items = recs.filter(
            (r) =>
              r?.kind === "item" && (r.label === "ai" || r.label === "human"),
          );
          if (!items.length) return "no item labels";

          const evalAt = (threshold) => {
            let tp = 0;
            let fp = 0;
            let tn = 0;
            let fn = 0;

            for (const r of items) {
              const feats =
                r?.features ||
                (r?.text ? pickMlFeaturesFromText(r.text) : null);
              if (!feats) continue;
              const p = rssPredictAiProba(state.v2Model, feats);
              const predAi = p >= threshold;
              const yAi = r.label === "ai";
              if (predAi && yAi) tp += 1;
              else if (predAi && !yAi) fp += 1;
              else if (!predAi && !yAi) tn += 1;
              else fn += 1;
            }

            const total = tp + fp + tn + fn;
            const acc = total ? (tp + tn) / total : 0;
            const prec = tp + fp ? tp / (tp + fp) : 0;
            const rec = tp + fn ? tp / (tp + fn) : 0;

            const pct = (x) => `${Math.round(clamp(x, 0, 1) * 100)}%`;
            return `t=${threshold}: acc ${pct(acc)} · prec ${pct(prec)} · rec ${pct(rec)} · TP ${tp} FP ${fp} TN ${tn} FN ${fn}`;
          };

          return `${evalAt(0.5)} | ${evalAt(RSS_V2_THRESHOLDS.itemAi)}`;
        })();

        v2Panel.innerHTML = `
          <div class="rss-font-semibold">v2 ML</div>
          <div class="rss-text-sm rss-muted" style="margin-top:4px">
            Labels: item AI ${labelCounts.itemAi} · item human ${labelCounts.itemHuman} · user AI ${labelCounts.userAi} · user human ${labelCounts.userHuman}
          </div>
          <div class="rss-text-sm rss-muted" style="margin-top:4px">
            Model updated: ${modelUpdatedAt}
          </div>
          <div class="rss-text-sm rss-muted" style="margin-top:4px">
            History fetch: ${state.v2Options?.enableHistoryFetch ? "on" : "off"} · extended: ${state.v2Options?.enableExtendedHistoryFetch ? "on" : "off"} · quota/day/user: ${Number(state.v2Options?.historyDailyQuotaPerUser ?? 0) || 0}
          </div>
          <div class="rss-text-sm rss-muted" style="margin-top:6px">
            Top weights: ${topWeights.map(([k, v]) => `${k}(${fmtScore(v, { signed: true, decimals: 2 })})`).join(" · ")}
          </div>
          <div class="rss-text-sm rss-muted" style="margin-top:6px">
            Eval: ${evalSummary}
          </div>
          <div class="rss-text-sm rss-muted" style="margin-top:6px">
            Train rows: tab ${state.v2TrainBuffer.length} · all ${state.v2TrainPersisted.length} · persist errors ${state.v2TrainPersistErrorCount}
          </div>
          <div class="rss-text-sm rss-muted" style="margin-top:4px">
            Storage: ${v2GetStorageKind()}
          </div>
          <div class="rss-flex rss-gap-2" style="margin-top:8px; flex-wrap: wrap">
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-export="labels">Copy labels JSON</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-export="model">Copy model JSON</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-export="train-jsonl">Copy RSS-train-data JSONL (this tab)</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-export="train-jsonl-all">Copy RSS-train-data JSONL (all pages)</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-import="labels">Import labels JSON</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-import="model">Import model JSON</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-export="train">Console: RSS-train-data JSONL (buffer)</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-undo="model">Undo tune</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-reset="model">Reset model</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-reset="labels">Clear labels</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-reset="train">Clear RSS-train-data</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-v2-toggle="extended-history">Toggle extended history</button>
          </div>
        `;

        const copyToClipboard = async (text) => {
          try {
            await win?.navigator?.clipboard?.writeText?.(text);
            return true;
          } catch {
            return false;
          }
        };

        v2Panel.querySelectorAll("[data-rss-v2-export]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.getAttribute("data-rss-v2-export");
            if (kind === "labels") {
              await copyToClipboard(JSON.stringify(state.v2Labels, null, 2));
              return;
            }
            if (kind === "model") {
              await copyToClipboard(JSON.stringify(state.v2Model, null, 2));
              return;
            }
            if (kind === "train-jsonl") {
              const jsonl = state.v2TrainBuffer
                .map((row) => JSON.stringify(row))
                .join("\n");
              await copyToClipboard(jsonl + (jsonl ? "\n" : ""));
              return;
            }
            if (kind === "train-jsonl-all") {
              const records = Array.isArray(state.v2TrainPersisted)
                ? state.v2TrainPersisted
                : [];
              const jsonl = records.map((row) => JSON.stringify(row)).join("\n");
              await copyToClipboard(jsonl + (jsonl ? "\n" : ""));
              return;
            }
            if (kind === "train") {
              try {
                for (const row of state.v2TrainBuffer) {
                  // eslint-disable-next-line no-console
                  console.log(JSON.stringify(row));
                }
              } catch {
                // Ignore.
              }
            }
          });
        });

        const promptPaste = (title) => {
          try {
            if (typeof win?.prompt !== "function") return null;
            return win.prompt(`${title}\nPaste JSON:`, "");
          } catch {
            return null;
          }
        };

        v2Panel.querySelectorAll("[data-rss-v2-import]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.getAttribute("data-rss-v2-import");
            const raw = promptPaste(
              kind === "labels" ? "Import labels" : "Import model",
            );
            if (!raw) return;

            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch {
              return;
            }

            if (kind === "labels") {
              if (
                !parsed ||
                typeof parsed !== "object" ||
                !Array.isArray(parsed.records)
              )
                return;
              state.v2Labels = parsed;

              // Rebuild in-memory user priors.
              state.v2UserLabel.clear();
              for (const r of parsed.records) {
                if (r?.kind !== "user") continue;
                const u = normalizeUsername(r.username);
                const label =
                  r.label === "ai"
                    ? "ai"
                    : r.label === "human"
                      ? "human"
                      : null;
                if (u && label) state.v2UserLabel.set(u, label);
              }

              v2SaveLabels();
              await refreshAllBadges();
              state.ui?.render?.();
              return;
            }

            if (kind === "model") {
              if (!parsed || typeof parsed !== "object") return;
              if (parsed.kind !== "logreg-binary") return;
              if (!parsed.weights || typeof parsed.weights !== "object") return;

              // Importing a model should be undoable.
              v2PushModelSnapshot();
              state.v2Model = {
                version: Number(parsed.version ?? 1) || 1,
                kind: "logreg-binary",
                weights: parsed.weights,
                bias: Number(parsed.bias ?? 0) || 0,
                updatedAt: Date.now(),
              };
              v2SaveModel();
              await refreshAllBadges();
              state.ui?.render?.();
            }
          });
        });

        v2Panel
          .querySelector('[data-rss-v2-undo="model"]')
          ?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await v2UndoLastTune();
          });

        v2Panel.querySelectorAll("[data-rss-v2-reset]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.getAttribute("data-rss-v2-reset");
            if (kind === "model") {
              state.v2Model = RSS_V2_DEFAULT_MODEL;
              v2SaveModel();
              state.v2ModelHistory = [];
              v2SaveModelHistory();
              await refreshAllBadges();
              state.ui?.render?.();
              return;
            }
            if (kind === "labels") {
              state.v2Labels = { version: 1, records: [] };
              state.v2UserLabel.clear();
              v2SaveLabels();
              await refreshAllBadges();
              state.ui?.render?.();
              return;
            }
            if (kind === "train") {
              state.v2TrainBuffer = [];
              state.v2TrainPersisted = [];
              v2SaveTrainData();
              state.ui?.render?.();
            }
          });
        });

        v2Panel.querySelectorAll("[data-rss-v2-toggle]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.getAttribute("data-rss-v2-toggle");
            if (kind === "extended-history") {
              state.v2Options.enableExtendedHistoryFetch =
                !state.v2Options.enableExtendedHistoryFetch;
              v2SaveOptions();
              await refreshAllBadges();
              state.ui?.render?.();
            }
          });
        });

        body.appendChild(details);
        body.appendChild(list);
        body.appendChild(v2Panel);

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

      const findBadgeFromEvent = (e) => {
        const path = (() => {
          try {
            return typeof e?.composedPath === "function"
              ? e.composedPath()
              : null;
          } catch {
            return null;
          }
        })();

        const nodes = Array.isArray(path) && path.length ? path : [e?.target];
        for (const n of nodes) {
          if (!(n instanceof win.Element)) continue;
          if (n.getAttribute?.(BADGE_ATTR) === "true") return n;
        }
        return null;
      };

      // Defensive: some Reddit surfaces re-render nodes and can drop our per-badge listeners.
      // Attach global handlers (capture) so badge interactions keep working.
      if (!state.globalBadgeHandlersAttached) {
        state.globalBadgeHandlersAttached = true;

        win.addEventListener(
          "click",
          (e) => {
            const badgeEl = findBadgeFromEvent(e);
            if (!badgeEl) return;

            const entryId = badgeEl.getAttribute?.(ENTRY_ID_ATTR);
            const entry = entryId ? state.entries.get(entryId) : null;
            if (!entry) return;

            // Prevent Reddit handlers from hijacking the click.
            e.preventDefault?.();
            e.stopPropagation?.();
            e.stopImmediatePropagation?.();

            state.selectedEntryId = entry.id;

            const isOpen = state.activePopoverEntryId === entry.id;
            if (isOpen) {
              setPopover({ show: false });
            } else {
              setPopover({ badgeEl, entry, show: true });
            }

            // Keep the drawer UI in sync if it's open.
            if (state.open) state.ui?.render?.();
          },
          true,
        );

        win.addEventListener(
          "pointerover",
          (e) => {
            if (!isHoverCapable(win)) return;
            const badgeEl = findBadgeFromEvent(e);
            if (!badgeEl) return;

            const entryId = badgeEl.getAttribute?.(ENTRY_ID_ATTR);
            const entry = entryId ? state.entries.get(entryId) : null;
            if (!entry) return;

            cancelPopoverHide();
            setPopover({ badgeEl, entry, show: true });
            if (state.open) state.ui?.render?.();
          },
          true,
        );

        win.addEventListener(
          "pointerout",
          (e) => {
            if (!isHoverCapable(win)) return;
            const badgeEl = findBadgeFromEvent(e);
            if (!badgeEl) return;
            schedulePopoverHide(120);
          },
          true,
        );
      }

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

      const ml = entry.ml || null;
      const mlTop = ml?.top || [];
      const mlPct =
        ml && Number.isFinite(ml.pAi) ? Math.round(ml.pAi * 100) : null;
      const userAgg = entry.ml?.userAgg || null;
      const userPct =
        userAgg && Number.isFinite(userAgg.meanPAi)
          ? Math.round(userAgg.meanPAi * 100)
          : null;
      const userLabel = state.v2UserLabel.get(entry.username) || null;

      const escapeHtml = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const botRatio = ratioToThreshold(
        entry.scores.bot,
        HARD_CODED_THRESHOLDS.bot,
      );
      const aiRatio = ratioToThreshold(
        entry.scores.ai,
        HARD_CODED_THRESHOLDS.ai,
      );
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

        <div class="rss-row" style="margin-bottom:10px">
          <div class="rss-text-sm rss-muted" style="margin-bottom:6px">v2 ML: ${mlPct === null ? "n/a" : `${mlPct}% AI`} · User avg: ${userPct === null ? "n/a" : `${userPct}%`} · User label: ${escapeHtml(userLabel || "- ")}</div>
          <div class="rss-text-sm rss-muted" style="margin-bottom:8px">Top features: ${mlTop
            .map((t) => `${escapeHtml(t.key)}(${formatDelta(t.contrib, 2)})`)
            .join(" · ")}</div>
          <div class="rss-flex rss-gap-2" style="flex-wrap:wrap">
            <button type="button" class="rss-btn rss-focus-ring" data-rss-label-item="human">Label item: Human</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-label-item="ai">Label item: AI</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-label-user="human">Label user: Human</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-label-user="ai">Label user: AI</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-export-labels="true">Export labels JSON</button>
            <button type="button" class="rss-btn rss-focus-ring" data-rss-export-train="true">Console: RSS-train-data row</button>
          </div>
        </div>

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

      pop
        .querySelector(".rss-popover-close")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          pop.style.display = "none";
          state.activePopoverEntryId = null;
        });

      // Label buttons.
      const safeCopy = async (text) => {
        try {
          await win?.navigator?.clipboard?.writeText?.(text);
          return true;
        } catch {
          return false;
        }
      };

      pop.querySelectorAll("[data-rss-label-item]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const label = btn.getAttribute("data-rss-label-item");

          // Train step (online fine-tune): update model using this label.
          if (label === "human" || label === "ai") {
            const y = label === "ai";
            v2PushModelSnapshot();
            state.v2Model = rssTrainStep(
              state.v2Model,
              entry.ml?.features || {},
              y,
              {
                lr: 0.06,
                l2: 1e-4,
              },
            );
            v2SaveModel();
          }

          v2AddLabelRecord({
            kind: "item",
            label,
            username: entry.username,
            entryId: entry.id,
            text: String(entry.text || ""),
            features: entry.ml?.features || null,
          });

          // Recompute existing entries under the new model.
          await refreshAllBadges();

          // Best-effort clipboard export of just this label.
          await safeCopy(
            JSON.stringify({
              kind: "item",
              label,
              username: entry.username,
              entryId: entry.id,
            }),
          );
        });
      });

      pop.querySelectorAll("[data-rss-label-user]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const label = btn.getAttribute("data-rss-label-user");
          v2AddLabelRecord({ kind: "user", label, username: entry.username });

          // Recompute entries to reflect new user prior.
          await refreshAllBadges();

          await safeCopy(
            JSON.stringify({ kind: "user", label, username: entry.username }),
          );
        });
      });

      pop
        .querySelector("[data-rss-export-labels]")
        ?.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const json = JSON.stringify(state.v2Labels, null, 2);
          await safeCopy(json);
        });

      pop
        .querySelector("[data-rss-export-train]")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const row = {
            kind: "rss-train-data",
            url: entry?.context?.url || String(win?.location?.href || ""),
            username: entry.username,
            entryId: entry.id,
            context: entry.context || null,
            text: String(entry.text || ""),
            features: entry.ml?.features || null,
          };
          try {
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(row));
          } catch {
            // Ignore.
          }
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
        container.querySelector?.(
          'faceplate-hovercard[data-id="community-hover-card"], faceplate-hovercard',
        ) ||
        container.querySelector?.('[data-testid="subreddit-name"]') ||
        container.querySelector?.('[slot="credit-bar"]') ||
        container.querySelector?.("shreddit-post-overflow-menu") ||
        null
      );
    };

    const hasExistingBadgeNear = (authorEl) => {
      if (!authorEl) return false;

      const rplHover = closestAcrossShadow(win, authorEl, "rpl-hovercard");
      if (rplHover?.nextElementSibling?.getAttribute?.(BADGE_ATTR) === "true")
        return true;

      const authorMeta = authorEl.closest?.(".author-name-meta");
      if (authorMeta?.nextElementSibling?.getAttribute?.(BADGE_ATTR) === "true")
        return true;

      const nowrap = authorEl.querySelector?.(".whitespace-nowrap");
      if (nowrap?.querySelector?.(`[${BADGE_ATTR}="true"]`)) return true;

      if (authorEl.nextElementSibling?.getAttribute?.(BADGE_ATTR) === "true")
        return true;

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

    const computeEntryBase = async ({ username, text, context }) => {
      const perUser = state.perUserHistory.get(username) || new Map();
      state.perUserHistory.set(username, perUser);

      const nameScore = scoreUsername(username);
      const textScore = scoreTextSignals(text, { perUserHistory: perUser });

      // v2 ML: compute base features first.
      const mlFeatures = pickMlFeaturesFromText(text);
      if (context && typeof context === "object") {
        if (context.subreddit) mlFeatures.ctxSubreddit = 1;
        if (context.kind === "comment") mlFeatures.ctxIsComment = 1;
        if (context.kind === "post") mlFeatures.ctxIsPost = 1;
        if (context.postTitle) mlFeatures.ctxHasPostTitle = 1;
        if (context.permalink) mlFeatures.ctxHasPermalink = 1;
      }
      let pAi = rssPredictAiProba(state.v2Model, mlFeatures);

      // Pull history features only when needed (uncertain band) to reduce requests and speed.
      const desiredHistoryLevel = state.v2Options.enableExtendedHistoryFetch
        ? 2
        : 1;
      const needHist =
        state.v2Options.enableHistoryFetch &&
        pAi >= 0.55 &&
        pAi <= 0.85 &&
        (state.userHistoryLevel.get(username) || 0) < desiredHistoryLevel;

      if (needHist) {
        const hist = await ensureUserHistoryFeatures(username, {
          level: desiredHistoryLevel,
        });
        if (hist) {
          Object.assign(mlFeatures, hist);
          pAi = rssPredictAiProba(state.v2Model, mlFeatures);
        }
      } else {
        // If cached already, include it.
        const cachedHist = state.userHistoryFeatures.get(username);
        if (cachedHist) Object.assign(mlFeatures, cachedHist);
      }

      const mlTop = rssTopContribs(state.v2Model, mlFeatures, 8);

      const botBaseScore = nameScore.score + textScore.botText.score;
      const aiScore = textScore.ai.score;

      return {
        baseScores: { botBase: botBaseScore, ai: aiScore },
        ml: { features: mlFeatures, pAi, top: mlTop },
        reasons: {
          bot: [...nameScore.reasons, ...textScore.botText.reasons],
          ai: [...textScore.ai.reasons],
        },
        breakdown: {
          bot: {
            username: nameScore.score,
            text: textScore.botText.score,
          },
          ai: { text: textScore.ai.score },
        },
      };
    };

    const finalizeEntryClassification = async ({ username, base, userAgg }) => {
      const userLabel = state.v2UserLabel.get(username) || null;

      // v2 guardrail: only let the per-user aggregate promote a user after we have
      // a few samples. This prevents one spicy/long comment from tagging a user.
      const USER_AI_MIN_SAMPLES = 3;

      // Combine item+user probabilities.
      const combinedPAi = (() => {
        if (userLabel === "ai") return 0.95;
        if (userLabel === "human") return Math.min(0.25, base.ml.pAi);
        // Weighted blend.
        return clamp(base.ml.pAi * 0.75 + userAgg.meanPAi * 0.25, 0, 1);
      })();

      const profile = await getUserProfile(username);
      const profileScore = scoreProfile(profile);

      const botScore = base.baseScores.botBase + profileScore.score;
      const aiScore = base.baseScores.ai;

      let classification = classify({
        botScore: base.baseScores.botBase,
        aiScore,
        profileScore: profileScore.score,
      });

      // v2: collapse "bot" into "ai" and allow ML to promote/demote.
      if (classification.kind === "bot")
        classification = { kind: "ai", emoji: "🧠" };

      const approxWordCount = (base.ml.features?.wordCount || 0) * 600;
      const mlHasEnoughText = approxWordCount >= 30;
      const userAggEligible = (userAgg?.n || 0) >= USER_AI_MIN_SAMPLES;
      const userAggHigh =
        userAggEligible && userAgg.meanPAi >= RSS_V2_THRESHOLDS.userAi;

      if (
        (combinedPAi >= RSS_V2_THRESHOLDS.itemAi && mlHasEnoughText) ||
        userAggHigh
      ) {
        classification = { kind: "ai", emoji: "🧠" };
      } else {
        // Only allow ✅ if both ML and heuristics are low and profile is strong.
        const combinedV1 = botScore + aiScore;

         // Primary (strict) condition.
         const canBeHumanStrict = combinedV1 <= 1.5;
         // Secondary condition: if we have multiple samples for the user and ML is consistently low,
         // relax the heuristic cap slightly. This makes profile/overview pages less spammy with ❓.
         const canBeHumanByUser =
           userAggEligible &&
           userAgg.meanPAi <= RSS_V2_THRESHOLDS.human &&
           base.baseScores.botBase <= 3.5 &&
           botScore <= 3;

        if (
          combinedPAi <= RSS_V2_THRESHOLDS.human &&
          (canBeHumanStrict || canBeHumanByUser) &&
          profileScore.score <= -2
        ) {
          classification = { kind: "human", emoji: "✅" };
        }
      }

      return {
        scores: { bot: botScore, ai: aiScore, profile: profileScore.score },
        reasons: {
          bot: base.reasons.bot,
          ai: base.reasons.ai,
          profile: profileScore.reasons,
        },
        breakdown: {
          ...base.breakdown,
          bot: { ...base.breakdown.bot, profile: profileScore.score },
        },
        classification,
        ml: {
          ...base.ml,
          userAgg,
        },
      };
    };

    const computeEntry = async ({ element, authorEl, username, text, entryId }) => {
      const ctx = extractEntryContext(element);
      const base = await computeEntryBase({ username, text, context: ctx });

      // Running aggregation for incremental scoring (single-entry attach path). Full recompute uses
      // a 2-pass aggregator so every entry sees the same per-user mean.
      const prevAgg = state.v2UserAgg.get(username) || { n: 0, meanPAi: 0 };
      const n1 = prevAgg.n + 1;
      const mean1 =
        prevAgg.n === 0
          ? base.ml.pAi
          : prevAgg.meanPAi + (base.ml.pAi - prevAgg.meanPAi) / n1;
      const agg = { n: n1, meanPAi: clamp(mean1, 0, 1) };
      state.v2UserAgg.set(username, agg);

      const finalized = await finalizeEntryClassification({
        username,
        base,
        userAgg: agg,
      });

      // Keep a training row buffer for ad-hoc console export.
      v2RememberTrainRow({
        kind: "rss-train-data",
        url: String(win?.location?.href || ""),
        username,
        entryId: entryId || null,
        text: String(text || ""),
        context: ctx,
        features: base.ml.features,
      });

      return finalized;
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
        context: extractEntryContext(element),
        scores: { bot: 0, ai: 0, profile: 0 },
        reasons: { bot: [], ai: [], profile: [] },
        classification: { kind: "unknown", emoji: "❓" },
        ml: null,
      };
      state.entries.set(entryId, entry);

      // Compute asynchronously (may fetch profile).
      const computed = await computeEntry({
        element,
        authorEl,
        username: u,
        text,
        entryId,
      });
      entry.scores = computed.scores;
      entry.reasons = computed.reasons;
      entry.classification = computed.classification;
      entry.ml = computed.ml;
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
          '.author-name-meta a[href^="/user/"], .author-name-meta a[href^="/u/"]',
        );
        if (
          authorMetaTextLink &&
          !(
            textSelForMentionFiltering &&
            authorMetaTextLink.closest?.(textSelForMentionFiltering)
          )
        ) {
          return authorMetaTextLink;
        }

        for (const sel of usernameSels) {
          const el = container.querySelector(sel);
          if (!el) continue;
          // Avoid u/mentions inside the body text.
          if (
            textSelForMentionFiltering &&
            el.closest?.(textSelForMentionFiltering)
          )
            continue;
          // Avoid links inside hovercard content slots (not the visible author handle).
          if (el.closest?.('[slot="content"]')) continue;
          // Avoid user links inside overflow menus.
          if (el.closest?.("shreddit-post-overflow-menu")) continue;
          // Avoid avatar-only profile links (common in comments).
          const visibleText = compactWs(safeText(el));
          if (!visibleText && el.querySelector?.("img, faceplate-img, svg"))
            continue;
          return el;
        }

        // Final fallback: first user link not in body text.
        const candidates = Array.from(
          container.querySelectorAll(
            'a[href^="/user/"], a[href^="/u/"], a[href*="/user/"], a[href*="/u/"]',
          ),
        );
        for (const el of candidates) {
          if (
            textSelForMentionFiltering &&
            el.closest?.(textSelForMentionFiltering)
          )
            continue;
          if (el.closest?.('[slot="content"]')) continue;
          if (el.closest?.("shreddit-post-overflow-menu")) continue;
          const visibleText = compactWs(safeText(el));
          if (!visibleText && el.querySelector?.("img, faceplate-img, svg"))
            continue;
          return el;
        }
        return null;
      };

      for (const node of nodes) {
        if (!(node instanceof win.HTMLElement)) continue;
        const processed = node.getAttribute(PROCESSED_ATTR) === "true";

        // Skip injecting into our own UI.
        if (
          node.closest?.(
            `#${UI_ROOT_ID}, .rss-drawer, .rss-overlay, .rss-tooltip, .rss-popover`,
          )
        ) {
          continue;
        }

        let authorEl = findAuthorEl(node);
        let username = authorEl ? extractUsernameFromAuthorEl(authorEl) : "";

        // Home feed sometimes doesn't show the author. Also, posts can contain other user links
        // (avatars, hovercards, etc.) that are NOT the author. Prefer overflow-menu author-name.
        const hiddenAuthor = resolveHiddenPostAuthor(node);
        if (hiddenAuthor) {
          const visibleMatches =
            username && normalizeUsername(username) === hiddenAuthor;
          if (!visibleMatches) {
            username = hiddenAuthor;
            authorEl =
              resolveFeedInsertionEl(node) ||
              node.querySelector?.("shreddit-post-overflow-menu") ||
              authorEl;
          }
        }

        if (!authorEl || !username) continue;

        // If a badge already exists near this author, treat this container as processed.
        // Important: our badge is sometimes inserted *outside* the content container
        // (e.g. after a hovercard host), so `node.querySelector([data-rss-badge])` is not reliable.
        if (hasExistingBadgeNear(authorEl)) {
          node.setAttribute(PROCESSED_ATTR, "true");
          continue;
        }

        // If the container claims it was processed but we no longer see a badge near the author,
        // allow reprocessing. This handles cases where Reddit re-renders and drops our injected node.
        if (processed) node.removeAttribute(PROCESSED_ATTR);

        // Note: posts in the feed may have no body text; allow empty string.
        const text = extractText(node) || "";
        node.setAttribute(PROCESSED_ATTR, "true");
        tasks.push(attachBadge({ element: node, authorEl, username, text }));
      }

      await Promise.all(tasks);
    };

    const refreshAllBadges = async () => {
      // Recompute classification when toggles change.
      //
      // IMPORTANT: recomputation must be deterministic.
      // - v1 near-duplicate uses per-user mutable state, so we rebuild it.
      // - v2 per-user aggregation must be a stable mean over all seen entries for that user,
      //   so we do a 2-pass recompute: pass 1 builds the aggregates, pass 2 classifies.
      state.v2UserAgg.clear();
      state.perUserHistory.clear();

      const baseById = new Map();
      const tmpAgg = new Map();

      // Pass 1: compute per-entry base scores + ML p(AI), and build per-user aggregates.
      for (const entry of state.entries.values()) {
        const base = await computeEntryBase({
          username: entry.username,
          text: entry.text,
        });
        baseById.set(entry.id, base);

        const prev = tmpAgg.get(entry.username) || { n: 0, meanPAi: 0 };
        const n1 = prev.n + 1;
        const mean1 =
          prev.n === 0
            ? base.ml.pAi
            : prev.meanPAi + (base.ml.pAi - prev.meanPAi) / n1;
        tmpAgg.set(entry.username, { n: n1, meanPAi: clamp(mean1, 0, 1) });
      }

      for (const [u, agg] of tmpAgg.entries()) state.v2UserAgg.set(u, agg);

      // Pass 2: finalize classification (profile fetches can be parallel).
      const tasks = [];
      for (const entry of state.entries.values()) {
        tasks.push(
          (async () => {
            const base = baseById.get(entry.id);
            if (!base) return;
            const agg = state.v2UserAgg.get(entry.username) || {
              n: 0,
              meanPAi: base.ml.pAi,
            };
            const computed = await finalizeEntryClassification({
              username: entry.username,
              base,
              userAgg: agg,
            });

            entry.scores = computed.scores;
            entry.reasons = computed.reasons;
            entry.classification = computed.classification;
            entry.ml = computed.ml;

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
          })(),
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
  // ESM Node can import this userscript file, but cannot access `module.exports`.
  // When running under Node, expose a minimal API on globalThis for offline training scripts.
  try {
    if (typeof process !== "undefined" && process?.versions?.node) {
      globalThis.__RSS_TRAIN__ = RSS_TRAIN_API;
    }
  } catch {
    // Ignore.
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createRedditSlopSleuth,
      // Stable hooks for offline pretraining and targeted unit tests.
      rssTrain: RSS_TRAIN_API,
    };
  }
  /* c8 ignore stop */

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!document.body) return;

  const engine = createRedditSlopSleuth({
    win: window,
    doc: document,
    fetchFn: window.fetch,
  });
  engine.start();
})();
