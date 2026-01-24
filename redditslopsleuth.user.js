// ==UserScript==
// @name         RedditSlopSleuth
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.1.8
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

  const SCRIPT_ID = "redditbotbuster";
  const UI_ROOT_ID = "rbb-root";
  const BADGE_ATTR = "data-rbb-badge";
  const PROCESSED_ATTR = "data-rbb-processed";
  const ENTRY_ID_ATTR = "data-rbb-entry-id";

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
  const PROFILE_STORAGE_PREFIX = "rbb-profile:";

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
    // Small Tailwind-like utility subset + component styles. All classnames are prefixed `rbb-`.
    return `
      :root {
        --rbb-z: 2147483646;
        --rbb-bg: rgba(255,255,255,0.92);
        --rbb-border: rgba(0,0,0,0.12);
        --rbb-shadow: 0 12px 32px rgba(0,0,0,0.25);
        --rbb-text: #111827;
        --rbb-muted: #6b7280;
        --rbb-blue: #2563eb;
        --rbb-red: #dc2626;
        --rbb-purple: #7c3aed;
        --rbb-green: #16a34a;
      }

      /* Utilities */
      .rbb-fixed { position: fixed; }
      .rbb-absolute { position: absolute; }
      .rbb-inset-0 { inset: 0; }
      .rbb-right-0 { right: 0; }
      .rbb-top-0 { top: 0; }
      .rbb-bottom-4 { bottom: 1rem; }
      .rbb-right-4 { right: 1rem; }
      .rbb-flex { display: flex; }
      .rbb-flex-col { flex-direction: column; }
      .rbb-items-center { align-items: center; }
      .rbb-justify-between { justify-content: space-between; }
      .rbb-gap-2 { gap: 0.5rem; }
      .rbb-gap-3 { gap: 0.75rem; }
      .rbb-p-3 { padding: 0.75rem; }
      .rbb-p-4 { padding: 1rem; }
      .rbb-px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
      .rbb-py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
      .rbb-rounded { border-radius: 0.5rem; }
      .rbb-rounded-full { border-radius: 9999px; }
      .rbb-border { border: 1px solid var(--rbb-border); }
      .rbb-shadow { box-shadow: var(--rbb-shadow); }
      .rbb-text-sm { font-size: 12px; }
      .rbb-text-base { font-size: 14px; }
      .rbb-font-semibold { font-weight: 600; }
      .rbb-font-bold { font-weight: 700; }
      .rbb-muted { color: var(--rbb-muted); }
      .rbb-bg { background: var(--rbb-bg); }
      .rbb-bg-solid { background: #fff; }
      .rbb-w-96 { width: 24rem; }
      .rbb-max-h-80vh { max-height: 80vh; }
      .rbb-overflow-auto { overflow: auto; }
      .rbb-select-none { user-select: none; }
      .rbb-cursor-pointer { cursor: pointer; }
      .rbb-hover-bg:hover { background: rgba(0,0,0,0.06); }
      .rbb-focus-ring:focus { outline: 2px solid var(--rbb-blue); outline-offset: 2px; }

      /* Badge */
      .rbb-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;
        width: 20px;
        height: 20px;
        border-radius: 9999px;
        border: 1px solid var(--rbb-border);
        background: rgba(255,255,255,0.85);
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        flex: 0 0 auto;
        flex-shrink: 0;
        position: relative;
        z-index: var(--rbb-z);
      }

      .rbb-badge[data-rbb-kind="bot"] { border-color: rgba(220, 38, 38, 0.35); }
      .rbb-badge[data-rbb-kind="ai"] { border-color: rgba(124, 58, 237, 0.35); }
      .rbb-badge[data-rbb-kind="human"] { border-color: rgba(22, 163, 74, 0.35); }

      /* Drawer */
      #${UI_ROOT_ID} { position: fixed; z-index: var(--rbb-z); }
      .rbb-gear {
        width: 44px;
        height: 44px;
        border-radius: 9999px;
        border: 1px solid var(--rbb-border);
        background: var(--rbb-bg);
        box-shadow: var(--rbb-shadow);
        color: var(--rbb-text);
        font-size: 18px;
      }

      .rbb-overlay {
        background: rgba(0,0,0,0.30);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }

      .rbb-drawer {
        height: 100vh;
        background: var(--rbb-bg);
        border-left: 1px solid var(--rbb-border);
        box-shadow: var(--rbb-shadow);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: var(--rbb-text);
      }

      .rbb-row {
        border: 1px solid var(--rbb-border);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        background: rgba(255,255,255,0.6);
      }

      .rbb-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--rbb-border);
        border-radius: 9999px;
        padding: 4px 8px;
        font-size: 12px;
        background: rgba(255,255,255,0.7);
      }

      .rbb-btn {
        border: 1px solid var(--rbb-border);
        border-radius: 0.5rem;
        padding: 8px 10px;
        background: rgba(255,255,255,0.8);
        cursor: pointer;
      }
      .rbb-btn:hover { background: rgba(255,255,255,1); }
      .rbb-btn-primary { border-color: rgba(37, 99, 235, 0.35); }

      .rbb-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .rbb-why {
        margin: 0;
        padding-left: 16px;
        color: var(--rbb-muted);
      }

      .rbb-tooltip {
        position: fixed;
        z-index: var(--rbb-z);
        max-width: 320px;
        background: rgba(17, 24, 39, 0.92);
        color: #fff;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        pointer-events: none;
        display: none;
      }

      .rbb-popover {
        position: fixed;
        z-index: var(--rbb-z);
        width: min(360px, calc(100vw - 24px));
        max-height: min(70vh, 520px);
        overflow: auto;
        background: rgba(255,255,255,0.98);
        color: var(--rbb-text);
        border: 1px solid var(--rbb-border);
        border-radius: 12px;
        box-shadow: var(--rbb-shadow);
        padding: 12px;
        display: none;
      }

      .rbb-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .rbb-popover-title {
        font-weight: 700;
        font-size: 14px;
      }

      .rbb-popover-close {
        border: 1px solid var(--rbb-border);
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
      return `rbb-${n}`;
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

  const scoreTextSignals = (text, { perUserHistory } = {}) => {
    const rawOriginal = String(text ?? "");
    const raw = compactWs(rawOriginal);
    const lower = raw.toLowerCase();
    const words = raw.split(/\s+/).filter(Boolean);

    const result = {
      ai: { score: 0, reasons: [] },
      botText: { score: 0, reasons: [] },
    };

    const hasEnoughWordsForStyleSignals = words.length >= 8;

    const safeStripToWordish = (s) => {
      try {
        // Keep unicode letters/numbers when supported.
        // c8 ignore next 3
        return s.replace(/[^\p{L}\p{N}<>]+/gu, " ");
      } catch {
        // Fallback for older runtimes.
        return s.replace(/[^a-z0-9<>]+/gi, " ");
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

    // ---- AI-ish signals (heuristics, not a detector) ----
    const aiReasons = result.ai.reasons;

    if (/\bas an ai\b|\bas an ai language model\b|\bi (can|cannot) (assist|help)\b/i.test(raw)) {
      result.ai.score += 10;
      aiReasons.push("self-disclosed AI (+10)");
    }

    // Meta discourse / analysis voice often produced by LLMs (EN + ES)
    if (
      /(\blet'?s\b|\blet me\b).*\b(analy[sz]e|break (?:it )?down|go through)\b/i.test(raw) ||
      /(\bvoy a\b|\bvamos a\b).*\b(analizar|desglosar|explicar|revisar)\b/i.test(raw)
    ) {
      result.ai.score += 1.5;
      aiReasons.push("meta 'let's analyze/break down' framing (+1.5)");
    }

    // Common template-y enumerations: "signs/indicators/evidence" style.
    if (
      /(\bindicators\b|\bsigns\b|\bevidence\b)\s+(that|of)\b/i.test(raw) ||
      /(\bindicadores\b|\bseñales\b|\bevidencia\b)\s+(de|que)\b/i.test(raw)
    ) {
      result.ai.score += 1;
      aiReasons.push("template 'signs/indicators/evidence' phrasing (+1)");
    }

    const transitionHits = [
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
    ].filter((p) => lower.includes(p)).length;
    if (transitionHits > 0 && hasEnoughWordsForStyleSignals && words.length > 40) {
      const add = clamp(transitionHits * 1.2, 1, 4);
      result.ai.score += add;
      aiReasons.push(`formulaic transitions x${transitionHits} (+${add.toFixed(1)})`);
    }

    const contractionHits = (lower.match(/\b(i'm|you're|we're|they're|can't|won't|didn't|isn't|it's)\b/g) || [])
      .length;
    if (hasEnoughWordsForStyleSignals && words.length > 60 && contractionHits <= 1) {
      result.ai.score += 2;
      aiReasons.push("very low contractions (+2)");
    }

    const sentences = raw
      .split(/[.!?]+/)
      .map((s) => compactWs(s))
      .filter(Boolean);
    if (hasEnoughWordsForStyleSignals && sentences.length >= 4) {
      const lens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
      const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
      const variance =
        lens.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lens.length;

      if (avg >= 18 && variance < 10 && words.length > 80) {
        result.ai.score += 2;
        aiReasons.push("long uniform sentences (+2)");
      }
    }

    const lines = rawOriginal.split(/\r?\n/).map((l) => l.trim());
    const listLines = lines.filter((l) => /^(?:[-*]\s+|\d+\.)/.test(l)).length;
    if (hasEnoughWordsForStyleSignals && listLines >= 3 && words.length > 60) {
      result.ai.score += 1.5;
      aiReasons.push("structured list formatting (+1.5)");
    }

    // Over-structured "Wikipedia section" vibe: many headings for a long post.
    const headingLines = lines.filter((l) => /^#{1,6}\s+\S+/.test(l)).length;
    if (words.length >= 350 && headingLines >= 6) {
      result.ai.score += 1.5;
      aiReasons.push(`heavy markdown sectioning (# headings x${headingLines}) (+1.5)`);
    }

    // Many outbound links in a long post can correlate with synthetic "compilation" style.
    const citationLinkCount = (rawOriginal.match(/https?:\/\//gi) || []).length;
    if (words.length >= 250 && citationLinkCount >= 6) {
      result.ai.score += 1;
      aiReasons.push(`many links/citations x${citationLinkCount} (+1)`);
    }

    // Coordinates / overly precise geodata formatting (weak signal, but common in synthetic writeups)
    if (/\b\d{1,2}°\d{2}'\d{2}"[NS]\b.*\b\d{1,3}°\d{2}'\d{2}"[EW]\b/i.test(rawOriginal)) {
      result.ai.score += 0.5;
      aiReasons.push("formatted GPS coordinates (+0.5)");
    }

    // Emoji penalty: content with emojis tends to be more human; reduce AI suspicion.
    if (/([\uD83C-\uDBFF][\uDC00-\uDFFF])/.test(rawOriginal)) {
      result.ai.score -= 1;
      aiReasons.push("contains emoji (-1)");
    }

    // Mild human cues: rhetorical questions / casual markers can reduce AI suspicion a bit.
    if (/(\?\s*$)|\b(?:lol|lmao|tbh|imo|imho|jaja|jajaja)\b/i.test(rawOriginal)) {
      result.ai.score -= 0.5;
      aiReasons.push("contains casual/rhetorical markers (-0.5)");
    }

    // ---- Bot-ish text signals ----
    const botReasons = result.botText.reasons;
    const shortReplies = new Set([
      "lol",
      "nice",
      "this",
      "this.",
      "agreed",
      "same",
      "true",
      "exactly",
      "thanks",
    ]);
    if (words.length <= 3 && shortReplies.has(lower.replace(/[^a-z.]/g, ""))) {
      result.botText.score += 2;
      botReasons.push("generic very short reply (+2)");
    }

    const linkCount = (raw.match(/https?:\/\//gi) || []).length;
    const suspiciousTld = /\.(?:xyz|top|click|buzz|live|shop|online|site|store)\b/i;
    if (suspiciousTld.test(raw)) {
      result.botText.score += 4;
      botReasons.push("suspicious TLD in text (+4)");
    }
    if (linkCount >= 2) {
      result.botText.score += 2;
      botReasons.push("multiple links (+2)");
    }

    if (perUserHistory) {
      const norm = normalizeForNearDuplicate(rawOriginal);
      if (norm.length >= 24) {
        const prev = perUserHistory.get(norm) || 0;
        if (prev >= 1) {
          result.botText.score += 2;
          botReasons.push("repeated near-duplicate message by same user (+2)");
        }
        perUserHistory.set(norm, prev + 1);
      }
    }

    result.ai.score = clamp(result.ai.score, 0, 20);
    result.botText.score = clamp(result.botText.score, 0, 20);
    return result;
  };

  const classify = ({ botScore, aiScore, profileScore }) => {
    const kind = (() => {
      if (botScore >= HARD_CODED_THRESHOLDS.bot) return "bot";
      if (aiScore >= HARD_CODED_THRESHOLDS.ai) return "ai";

      const combined = botScore + aiScore + profileScore;
      if (combined <= HARD_CODED_THRESHOLDS.human) return "human";

      return "unknown";
    })();

    const emoji =
      kind === "bot" ? "🤖" : kind === "ai" ? "🧠" : kind === "human" ? "✅" : "❓";

    return { kind, emoji };
  };

  const createRedditBotBuster = ({ win, doc, fetchFn }) => {
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
      root.className = "rbb-fixed rbb-bottom-4 rbb-right-4";

      const gearBtn = doc.createElement("button");
      gearBtn.className = "rbb-gear rbb-select-none rbb-cursor-pointer rbb-focus-ring";
      gearBtn.type = "button";
      gearBtn.title = "RedditBotBuster";
      gearBtn.textContent = "⚙️";

      const overlay = doc.createElement("div");
      overlay.className = "rbb-fixed rbb-inset-0 rbb-overlay";
      overlay.style.display = "none";

      const drawer = doc.createElement("div");
      drawer.className = "rbb-fixed rbb-top-0 rbb-right-0 rbb-w-96 rbb-drawer";
      drawer.style.display = "none";
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-label", "RedditBotBuster");

      const tooltip = doc.createElement("div");
      tooltip.className = "rbb-tooltip";
      doc.body.appendChild(tooltip);
      state.tooltipEl = tooltip;

      const popover = doc.createElement("div");
      popover.className = "rbb-popover";
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
        header.className = "rbb-flex rbb-justify-between rbb-items-center rbb-p-4";
        header.innerHTML = `
          <div>
            <div class="rbb-font-bold rbb-text-base">RedditBotBuster</div>
            <div class="rbb-text-sm rbb-muted">Badges: ${counts.bot} 🤖 · ${counts.ai} 🧠 · ${counts.human} ✅ · ${counts.unknown} ❓</div>
          </div>
        `;

        const closeBtn = doc.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "rbb-btn rbb-cursor-pointer rbb-focus-ring";
        closeBtn.textContent = "Close";
        closeBtn.addEventListener("click", () => setOpen(false));
        header.appendChild(closeBtn);

        const body = doc.createElement("div");
        body.className = "rbb-p-4 rbb-flex rbb-flex-col rbb-gap-3 rbb-overflow-auto rbb-max-h-80vh";

        const details = doc.createElement("div");
        details.className = "rbb-row";

        if (!selected) {
          details.innerHTML = `<div class="rbb-font-semibold">Click a badge</div><div class="rbb-text-sm rbb-muted">Click 🤖/🧠/✅/❓ next to a username to see why.</div>`;
        } else {
          const pill = (label, value) => {
            const p = doc.createElement("span");
            p.className = "rbb-pill";
            p.innerHTML = `<span class="rbb-muted">${label}</span><span class="rbb-font-semibold">${value}</span>`;
            return p;
          };

          const top = doc.createElement("div");
          top.className = "rbb-flex rbb-flex-col rbb-gap-2";
          const title = doc.createElement("div");
          title.className = "rbb-font-bold rbb-text-base";
          title.textContent = `${selected.classification.emoji} u/${selected.username}`;
          top.appendChild(title);

          const pills = doc.createElement("div");
          pills.className = "rbb-flex rbb-gap-2";
          pills.appendChild(pill("Bot", selected.scores.bot.toFixed(1)));
          pills.appendChild(pill("AI", selected.scores.ai.toFixed(1)));
          pills.appendChild(pill("Profile", selected.scores.profile.toFixed(1)));
          top.appendChild(pills);

          const why = doc.createElement("div");
          const whyList = doc.createElement("ul");
          whyList.className = "rbb-why";

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
          btnRow.className = "rbb-flex rbb-gap-2";
          const scrollBtn = doc.createElement("button");
          scrollBtn.type = "button";
          scrollBtn.className = "rbb-btn rbb-btn-primary rbb-focus-ring";
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
        list.className = "rbb-row";
        const listTitle = doc.createElement("div");
        listTitle.className = "rbb-font-semibold";
        listTitle.textContent = "Recent";
        list.appendChild(listTitle);

        const listBody = doc.createElement("div");
        listBody.className = "rbb-flex rbb-flex-col rbb-gap-2";

        const entries = Array.from(state.entries.values()).slice(-30).reverse();
        if (entries.length === 0) {
          const empty = doc.createElement("div");
          empty.className = "rbb-text-sm rbb-muted";
          empty.textContent = "Nothing analyzed yet.";
          listBody.appendChild(empty);
        } else {
          for (const e of entries) {
            const row = doc.createElement("div");
            row.className = "rbb-row rbb-hover-bg rbb-cursor-pointer";
            row.innerHTML = `<div class="rbb-flex rbb-justify-between rbb-items-center"><div class="rbb-font-semibold">${e.classification.emoji} u/${e.username}</div><div class="rbb-text-sm rbb-muted">Bot ${e.scores.bot.toFixed(1)} · AI ${e.scores.ai.toFixed(1)}</div></div>`;
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

      const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      pop.innerHTML = `
        <div class="rbb-popover-header">
          <div class="rbb-popover-title">${entry.classification.emoji} u/${entry.username}</div>
          <button type="button" class="rbb-popover-close" aria-label="Close">✕</button>
        </div>
        <div class="rbb-text-sm rbb-muted" style="margin-bottom:8px">Bot ${entry.scores.bot.toFixed(1)} · AI ${entry.scores.ai.toFixed(1)} · Profile ${entry.scores.profile.toFixed(1)}</div>
        <ul class="rbb-why">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      `;

      pop.querySelector(".rbb-popover-close")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pop.style.display = "none";
        state.activePopoverEntryId = null;
      });

      // Show first, then position with measured size.
      pop.style.display = "block";
      state.activePopoverEntryId = entry.id;

      const margin = 12;
      const rect = badgeEl?.getBoundingClientRect?.() || { left: margin, top: margin, right: margin, bottom: margin };
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
      badge.className = "rbb-badge";
      badge.setAttribute(BADGE_ATTR, "true");
      badge.setAttribute("data-rbb-kind", "unknown");
      badge.textContent = "❓";

      const entryId = makeId();
      badge.setAttribute(ENTRY_ID_ATTR, entryId);

      insertBadge({ authorEl, badgeEl: badge });
      addBadgeRef(u, badge);

      const ui = buildUi();

      const updateBadgeFromEntry = (entry) => {
        badge.textContent = entry.classification.emoji;
        badge.setAttribute("data-rbb-kind", entry.classification.kind);

        const hoverLines = [
          `<div style="font-weight:700;margin-bottom:6px">${entry.classification.emoji} u/${entry.username}</div>`,
          `<div><b>Bot</b>: ${entry.scores.bot.toFixed(1)} · <b>AI</b>: ${entry.scores.ai.toFixed(1)} · <b>Profile</b>: ${entry.scores.profile.toFixed(1)}</div>`,
        ];
        badge.dataset.rbbTooltip = hoverLines.join("");
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

        const html = badge.dataset.rbbTooltip;
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
        const html = badge.dataset.rbbTooltip;
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
      for (const sel of SELECTORS.text) {
        const node = container.querySelector(sel);
        const txt = compactWs(safeText(node));
        if (txt) return txt;
      }

      // Fallback: paragraphs.
      const ps = Array.from(container.querySelectorAll("p"));
      const para = compactWs(ps.map((p) => safeText(p)).join("\n"));
      if (para) return para;

      // Final fallback: container text.
      return compactWs(safeText(container));
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
        if (node.closest?.(`#${UI_ROOT_ID}, .rbb-drawer, .rbb-overlay, .rbb-tooltip, .rbb-popover`)) {
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
              badgeEl.setAttribute("data-rbb-kind", entry.classification.kind);
              badgeEl.dataset.rbbTooltip = `
                <div style="font-weight:700;margin-bottom:6px">${entry.classification.emoji} u/${entry.username}</div>
                <div><b>Bot</b>: ${entry.scores.bot.toFixed(1)} · <b>AI</b>: ${entry.scores.ai.toFixed(1)} · <b>Profile</b>: ${entry.scores.profile.toFixed(1)}</div>
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
    module.exports = { createRedditBotBuster };
  }
  /* c8 ignore stop */

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!document.body) return;

  const engine = createRedditBotBuster({ win: window, doc: document, fetchFn: window.fetch });
  engine.start();
})();
