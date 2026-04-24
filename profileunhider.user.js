// ==UserScript==
// @name         ProfileUnhider
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.2.3
// @description  Reveal publicly indexed posts and comments for hidden Reddit profiles.
// @author       Toni Oriol
// @run-at       document-idle
// @match        *://reddit.com/user/*
// @match        *://www.reddit.com/user/*
// @match        *://new.reddit.com/user/*
// @match        *://sh.reddit.com/user/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/profileunhider.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/profileunhider.user.js
// ==/UserScript==

(() => {
  "use strict";

  const ORIGIN = "https://www.reddit.com";
  const STYLE_ID = "pu-inline-style";
  const ROOT_ID = "pu-inline-root";
  const PAGE_SIZE = 25;
  const HIDDEN_PATTERNS = [
    /likes to keep their (posts|comments|content|activity) hidden/i,
    /profile is hidden/i,
    /has set their profile to private/i,
    /hidden by the user/i,
  ];

  const state = {
    username: null,
    routeKind: "overview",
    view: "posts",
    showingRecovered: false,
    buckets: {
      posts: createBucket(),
      comments: createBucket(),
    },
  };

  function createBucket() {
    return {
      items: [],
      after: null,
      loaded: false,
      loading: false,
      error: "",
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function textToHtml(value) {
    return escapeHtml(String(value || "")).replace(/\n/g, "<br>");
  }

  function truncate(value, maxLength) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function timeAgo(utcSeconds) {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(utcSeconds || 0));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
  }

  function formatScore(value) {
    const score = Number(value || 0);
    if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
    return String(score);
  }

  function getUsername() {
    const match = window.location.pathname.match(/^\/user\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getRouteKind() {
    if (/^\/user\/[^/]+\/comments\/?$/i.test(window.location.pathname)) return "comments";
    if (/^\/user\/[^/]+\/submitted\/?$/i.test(window.location.pathname)) return "posts";
    return "overview";
  }

  function isHiddenProfilePage() {
    const pageText = String(document.body?.innerText || "");
    return HIDDEN_PATTERNS.some((pattern) => pattern.test(pageText));
  }

  function getFeed() {
    return document.querySelector("shreddit-feed");
  }

  function getEmptyFeed() {
    return document.getElementById("empty-feed-content");
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        margin: 0 0 8px;
      }
      #${ROOT_ID} .pu-card {
        border: 1px solid var(--color-neutral-border-weak, rgba(0,0,0,0.12));
        border-radius: 1rem;
        background: var(--color-neutral-background, #fff);
        overflow: hidden;
      }
      #${ROOT_ID} .pu-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        flex-wrap: wrap;
      }
      #${ROOT_ID} .pu-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--color-neutral-content-strong, #1f2937);
      }
      #${ROOT_ID} .pu-subtitle {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--color-neutral-content-weak, #6b7280);
      }
      #${ROOT_ID} .pu-button {
        border: 0;
        border-radius: 999px;
        padding: 8px 14px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        background: var(--color-primary-button, #ff4500);
        color: white;
        white-space: nowrap;
      }
      #${ROOT_ID} .pu-button:disabled {
        opacity: 0.7;
        cursor: progress;
      }
      #${ROOT_ID} .pu-toolbar {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 16px 12px;
        flex-wrap: wrap;
      }
      #${ROOT_ID}[data-open="true"] .pu-toolbar {
        display: flex;
      }
      #${ROOT_ID} .pu-switches {
        display: inline-flex;
        gap: 6px;
      }
      #${ROOT_ID} .pu-switch {
        border: 1px solid var(--color-neutral-border-medium, rgba(0,0,0,0.16));
        border-radius: 999px;
        background: transparent;
        color: var(--color-neutral-content, #334155);
        font: inherit;
        font-weight: 600;
        padding: 6px 12px;
        cursor: pointer;
      }
      #${ROOT_ID} .pu-switch.is-active {
        background: var(--color-secondary-background-selected, rgba(0,0,0,0.06));
        color: var(--color-neutral-content-strong, #111827);
      }
      #${ROOT_ID} .pu-status {
        margin: 0;
        font-size: 12px;
        color: var(--color-neutral-content-weak, #6b7280);
      }
      .pu-recovered-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 700;
        color: #c2410c;
        background: rgba(249, 115, 22, 0.12);
      }
      .pu-item-outline {
        border: 1px solid rgba(249, 115, 22, 0.24);
      }
      .pu-load-more-wrap {
        margin: 8px 0 0;
      }
      .pu-load-more {
        width: 100%;
      }
      .pu-recovered-note {
        margin-left: auto;
      }
    `;

    document.head.appendChild(style);
  }

  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function getUi() {
    const root = getRoot();
    if (!root) return null;

    return {
      root,
      revealButton: root.querySelector("[data-pu-role='reveal']"),
      switches: Array.from(root.querySelectorAll("[data-pu-switch]")),
      status: root.querySelector("[data-pu-role='status']"),
      loadMore: root.querySelector("[data-pu-role='load-more']"),
    };
  }

  function hideEmptyPlaceholder() {
    const empty = getEmptyFeed();
    if (empty) empty.hidden = true;
  }

  function showEmptyPlaceholder() {
    const empty = getEmptyFeed();
    if (empty) empty.hidden = false;
  }

  function removeRecoveredItems() {
    document.querySelectorAll("[data-pu-recovered-item='true']").forEach((node) => node.remove());
  }

  function getInsertionReference() {
    const empty = getEmptyFeed();
    if (empty) return empty;
    const feed = getFeed();
    return feed?.firstElementChild || null;
  }

  function ensureRoot() {
    ensureStyles();

    let root = getRoot();
    if (root) return root;

    // Try shreddit-feed first, fall back to tabpanel or main content area.
    const feed = getFeed();
    const container = feed
      || document.querySelector("faceplate-tabpanel#profile-feed-tabs")
      || document.querySelector("#main-content > div > div:last-child");

    if (!container) return null;

    root = document.createElement("article");
    root.id = ROOT_ID;
    root.className = "w-full m-0";
    root.innerHTML = `
      <div class="pu-card">
        <div class="pu-header px-md py-sm">
          <div>
            <p class="pu-title">Recovered activity</p>
            <p class="pu-subtitle">Show public indexed items in the native Reddit feed.</p>
          </div>
          <button class="pu-button" type="button" data-pu-role="reveal">Reveal</button>
        </div>
        <div class="pu-toolbar">
          <div class="pu-switches"></div>
          <p class="pu-status" data-pu-role="status">Ready.</p>
        </div>
      </div>
    `;

    if (feed) {
      const reference = getInsertionReference();
      if (reference) {
        feed.insertBefore(root, reference);
      } else {
        feed.appendChild(root);
      }
    } else {
      // No shreddit-feed yet: append after the container.
      container.after(root);
    }

    bindRootEvents(root);
    renderRoot();
    return root;
  }

  function availableViews() {
    if (state.routeKind === "posts") return ["posts"];
    if (state.routeKind === "comments") return ["comments"];
    return ["posts", "comments"];
  }

  function renderRoot() {
    const ui = getUi();
    if (!ui) return;

    const bucket = state.buckets[state.view];
    const viewLabel = state.view === "posts" ? "posts" : "comments";

    ui.root.dataset.open = String(state.showingRecovered);
    ui.revealButton.textContent = state.showingRecovered ? `Hide recovered ${viewLabel}` : `Reveal ${viewLabel}`;
    ui.revealButton.disabled = bucket.loading;

    const switchMarkup = availableViews().map((view) => {
      const isActive = state.view === view ? " is-active" : "";
      const label = view === "posts" ? "Posts" : "Comments";
      return `<button class="pu-switch${isActive}" type="button" data-pu-switch="${view}">${label}</button>`;
    }).join("");
    ui.root.querySelector(".pu-switches").innerHTML = switchMarkup;

    if (!state.showingRecovered) {
      ui.status.textContent = "Ready.";
    } else if (bucket.loading && !bucket.loaded) {
      ui.status.textContent = `Loading recovered ${viewLabel}…`;
    } else if (bucket.error) {
      ui.status.textContent = bucket.error;
    } else if (!bucket.items.length) {
      ui.status.textContent = `No recovered ${viewLabel} found.`;
    } else {
      ui.status.textContent = `${bucket.items.length} recovered ${viewLabel} shown.`;
    }

    if (!ui.loadMore) {
      const wrap = document.createElement("div");
      wrap.className = "pu-load-more-wrap";
      wrap.innerHTML = `<button class="pu-button pu-load-more" type="button" data-pu-role="load-more">Load more</button>`;
      ui.root.appendChild(wrap);
    }

    const loadMore = getUi()?.loadMore;
    if (!loadMore) return;
    loadMore.hidden = !(state.showingRecovered && bucket.after);
    loadMore.disabled = bucket.loading;
    loadMore.textContent = bucket.loading && bucket.loaded ? "Loading…" : `Load more ${viewLabel}`;
  }

  function bindRootEvents(root) {
    root.addEventListener("click", async (event) => {
      const revealButton = event.target.closest("[data-pu-role='reveal']");
      if (revealButton) {
        await onRevealClick();
        return;
      }

      const switchButton = event.target.closest("[data-pu-switch]");
      if (switchButton) {
        const nextView = switchButton.getAttribute("data-pu-switch");
        if (!nextView || nextView === state.view) return;
        state.view = nextView;
        renderRoot();
        if (state.showingRecovered) {
          await ensureViewLoaded(nextView);
          syncFeed();
        }
        return;
      }

      const loadMore = event.target.closest("[data-pu-role='load-more']");
      if (loadMore) {
        await loadCurrentView(true);
      }
    });
  }

  async function onRevealClick() {
    state.showingRecovered = !state.showingRecovered;
    renderRoot();

    if (!state.showingRecovered) {
      removeRecoveredItems();
      showEmptyPlaceholder();
      renderRoot();
      return;
    }

    await ensureViewLoaded(state.view);
    syncFeed();
  }

  async function ensureViewLoaded(view) {
    const bucket = state.buckets[view];
    if (bucket.loaded || bucket.loading) return;
    await loadView(view, false);
  }

  async function loadCurrentView(append) {
    await loadView(state.view, append);
    syncFeed();
  }

  async function loadView(view, append) {
    const bucket = state.buckets[view];
    if (bucket.loading) return;

    bucket.loading = true;
    bucket.error = "";
    renderRoot();

    try {
      const result = view === "posts"
        ? await fetchPosts(state.username, append ? bucket.after : null)
        : await fetchComments(state.username, append ? bucket.after : null);

      bucket.items = append ? bucket.items.concat(result.items) : result.items;
      bucket.after = result.after;
      bucket.loaded = true;
    } catch (error) {
      bucket.error = `Failed to load recovered ${view}: ${error.message}`;
    } finally {
      bucket.loading = false;
      renderRoot();
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}`);
    }

    return response.json();
  }

  async function fetchPosts(username, after) {
    const params = new URLSearchParams({
      q: `author:${username}`,
      type: "link",
      limit: String(PAGE_SIZE),
      sort: "new",
      raw_json: "1",
    });
    if (after) params.set("after", after);

    const json = await fetchJson(`${ORIGIN}/search.json?${params.toString()}`);
    return {
      items: (json.data?.children || []).map((child) => child.data),
      after: json.data?.after || null,
    };
  }

  function findCommentByAuthor(children, username) {
    for (const child of children || []) {
      const data = child?.data;
      if (child?.kind === "t1" && data?.author === username && data?.body) {
        return data;
      }
      const replies = data?.replies?.data?.children;
      if (replies?.length) {
        const nested = findCommentByAuthor(replies, username);
        if (nested) return nested;
      }
    }
    return null;
  }

  async function hydrateComment(stub, username) {
    try {
      const fallbackPostId = String(stub.permalink || "").split("/").filter(Boolean)[3] || "";
      const postId = String(stub.link_id || "").replace(/^t3_/, "") || fallbackPostId;
      if (!postId || !stub.subreddit) return null;

      const json = await fetchJson(`${ORIGIN}/r/${encodeURIComponent(stub.subreddit)}/comments/${postId}.json?limit=500&raw_json=1`);
      const comment = findCommentByAuthor(json[1]?.data?.children || [], username);
      if (!comment) return null;

      return {
        ...stub,
        body: comment.body || stub.body || "",
        permalink: comment.permalink || stub.permalink || "",
        link_title: comment.link_title || stub.link_title || stub.title || "View thread",
      };
    } catch {
      return null;
    }
  }

  async function fetchComments(username, after) {
    const params = new URLSearchParams({
      q: `Author:"${username}"`,
      type: "comment",
      limit: String(PAGE_SIZE),
      sort: "new",
      raw_json: "1",
    });
    if (after) params.set("after", after);

    const json = await fetchJson(`${ORIGIN}/search.json?${params.toString()}`);
    const stubs = (json.data?.children || []).map((child) => child.data);
    const hydrated = await Promise.all(stubs.map((stub) => hydrateComment(stub, username)));

    return {
      items: hydrated.filter(Boolean),
      after: json.data?.after || null,
    };
  }

  function getCommentUrl(item) {
    const permalink = String(item.permalink || "");
    const match = permalink.match(/\/comments\/([a-z0-9]+)\/[^/]*\/([a-z0-9]+)/i);
    if (match) {
      return `${ORIGIN}/r/${encodeURIComponent(item.subreddit || "")}/comments/${match[1]}/_/${match[2]}/?context=3`;
    }
    return `${ORIGIN}${permalink}?context=3`;
  }

  function createRecoveredComment(item) {
    const article = document.createElement("article");
    article.className = "w-full m-0";
    article.dataset.puRecoveredItem = "true";
    article.innerHTML = `
      <div class="hover:bg-neutral-background-hover relative rounded-4 pu-item-outline">
        <a href="${escapeHtml(getCommentUrl(item))}" class="absolute inset-0" target="_blank" aria-label="Recovered comment thread"></a>
        <div class="px-md py-sm">
          <div class="text-12 relative w-fit">
            <div class="flex items-center gap-xs flex-wrap text-neutral-content-weak">
              <span class="text-tone-1 font-semibold">${escapeHtml(item.subreddit_name_prefixed || `r/${item.subreddit || ""}`)}</span>
              <span class="pu-recovered-label">Recovered</span>
              <span>${timeAgo(item.created_utc)}</span>
              <span>${formatScore(item.score)} pts</span>
            </div>
          </div>
          <div class="grow leading-6 text-neutral-content-strong mt-xs">
            <h2 class="m-0 text-14 font-semibold">${escapeHtml(item.link_title || "View thread")}</h2>
            <div class="md pt-xs pb-2xs text-14" dir="auto">${textToHtml(truncate(item.body, 420))}</div>
          </div>
        </div>
      </div>
    `;
    return article;
  }

  function createRecoveredPost(item) {
    const article = document.createElement("article");
    article.className = "w-full m-0";
    article.dataset.puRecoveredItem = "true";
    article.innerHTML = `
      <div class="block relative bg-neutral-background hover:bg-neutral-background-hover xs:rounded-4 px-md py-2xs my-2xs pu-item-outline">
        <a class="absolute inset-0" href="${ORIGIN}${escapeHtml(item.permalink || "")}" target="_blank" aria-label="Recovered post"></a>
        <div class="flex justify-between text-12 min-h-[32px] mb-2xs mt-[-4px]">
          <div class="flex flex-wrap text-12 gap-2xs items-center min-w-0 relative text-neutral-content-weak">
            <span class="text-tone-1 font-semibold">${escapeHtml(item.subreddit_name_prefixed || `r/${item.subreddit || ""}`)}</span>
            <span class="pu-recovered-label">Recovered</span>
            <span>${timeAgo(item.created_utc)}</span>
            <span>${formatScore(item.score)} pts</span>
            <span>${Number(item.num_comments || 0)} comments</span>
          </div>
        </div>
        <a class="block text-neutral-content-strong m-0 font-semibold text-16-scalable xs:text-18-scalable mb-2xs overflow-hidden" href="${ORIGIN}${escapeHtml(item.permalink || "")}" target="_blank" dir="auto">${escapeHtml(item.title || "Untitled post")}</a>
        ${item.selftext ? `<div class="mb-xs overflow-hidden"><div class="text-14-scalable pb-2xs" dir="auto">${textToHtml(truncate(item.selftext, 280))}</div></div>` : ""}
      </div>
    `;
    return article;
  }

  function syncFeed() {
    removeRecoveredItems();

    if (!state.showingRecovered) {
      showEmptyPlaceholder();
      renderRoot();
      return;
    }

    const feed = getFeed();
    const root = getRoot();
    if (!feed || !root) return;

    const bucket = state.buckets[state.view];
    if (!bucket.items.length) {
      showEmptyPlaceholder();
      renderRoot();
      return;
    }

    hideEmptyPlaceholder();

    let insertionPoint = root.nextSibling;
    bucket.items.forEach((item) => {
      const node = state.view === "posts" ? createRecoveredPost(item) : createRecoveredComment(item);
      if (insertionPoint) {
        feed.insertBefore(node, insertionPoint);
      } else {
        feed.appendChild(node);
      }
    });

    renderRoot();
  }

  function resetState() {
    state.username = getUsername();
    state.routeKind = getRouteKind();
    state.view = state.routeKind === "comments" ? "comments" : "posts";
    state.showingRecovered = false;
    state.buckets.posts = createBucket();
    state.buckets.comments = createBucket();

    removeRecoveredItems();
    const root = getRoot();
    if (root) root.remove();
    showEmptyPlaceholder();
  }

  function injectIfNeeded() {
    const username = getUsername();
    if (!username) { console.log("[PU] no username"); return; }
    if (!isHiddenProfilePage()) { console.log("[PU] not hidden page"); return; }

    console.log("[PU] injecting for", username);

    state.username = username;
    state.routeKind = getRouteKind();
    if (state.routeKind !== "overview") {
      state.view = state.routeKind;
    }
    ensureRoot();
    renderRoot();
  }

  resetState();

  // Simple polling loop: runs every 1s, stops when injected or after 30s.
  // Also detects SPA route changes and re-injects.
  let lastPath = window.location.pathname;

  const poller = window.setInterval(() => {
    const currentPath = window.location.pathname;

    if (currentPath !== lastPath) {
      lastPath = currentPath;
      resetState();
    }

    if (!getRoot()) {
      injectIfNeeded();
    }
  }, 1000);

  // Stop polling after 30 seconds if nothing was injected (not a hidden profile).
  window.setTimeout(() => {
    if (!getRoot()) {
      window.clearInterval(poller);
    }
  }, 30000);
})();
