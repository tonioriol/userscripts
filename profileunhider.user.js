// ==UserScript==
// @name         ProfileUnhider
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.0.1
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

  const SCRIPT_ID = "profile-unhider-userscript";
  const STYLE_ID = "profile-unhider-style";
  const HIDDEN_PHRASES = [
    "likes to keep their posts hidden",
    "profile is hidden",
    "this user has set their profile to private",
    "user has set their profile to private",
    "hidden by the user",
  ];

  const esc = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

  const timeAgo = (utc) => {
    const seconds = Math.floor(Date.now() / 1000) - Number(utc || 0);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
  };

  const formatScore = (value) => {
    const num = Number(value || 0);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  };

  const getUsername = () => {
    const match = window.location.pathname.match(/^\/user\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const isHiddenProfile = () => {
    const text = String(document.body?.innerText || "").toLowerCase();
    return HIDDEN_PHRASES.some((phrase) => text.includes(phrase));
  };

  const findAnchor = () => {
    const exact = Array.from(document.querySelectorAll("div, p, span")).find((element) => {
      if (element.childElementCount !== 0) return false;
      const text = String(element.textContent || "").toLowerCase();
      return HIDDEN_PHRASES.some((phrase) => text.includes(phrase));
    });

    if (exact) {
      let current = exact;
      for (let index = 0; index < 5; index += 1) {
        if (!current.parentElement) break;
        if (current.parentElement.tagName === "SHREDDIT-FEED") break;
        current = current.parentElement;
      }
      return current;
    }

    return document.querySelector("shreddit-profile-error, [data-testid='profile-not-found']");
  };

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SCRIPT_ID} {
        width: 100%;
        margin: 0 0 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-sizing: border-box;
      }

      #${SCRIPT_ID},
      #${SCRIPT_ID} * {
        box-sizing: border-box;
      }

      #${SCRIPT_ID} .pu-shell {
        background: #ffffff;
        border: 1px solid #edeff1;
        border-radius: 12px;
        padding: 14px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      }

      #${SCRIPT_ID} .pu-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      #${SCRIPT_ID} .pu-brand {
        font-size: 12px;
        font-weight: 800;
        color: #ff4500;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      #${SCRIPT_ID} .pu-button,
      #${SCRIPT_ID} .pu-tab,
      #${SCRIPT_ID} .pu-more {
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
      }

      #${SCRIPT_ID} .pu-button {
        padding: 10px 16px;
        background: #ff4500;
        color: #fff;
        font-weight: 700;
      }

      #${SCRIPT_ID} .pu-button.is-active {
        background: #343536;
      }

      #${SCRIPT_ID} .pu-panel {
        margin-top: 14px;
        display: none;
      }

      #${SCRIPT_ID} .pu-panel.is-open {
        display: block;
      }

      #${SCRIPT_ID} .pu-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }

      #${SCRIPT_ID} .pu-tab {
        padding: 8px 12px;
        background: #f6f7f8;
        color: #6b7280;
        font-weight: 700;
      }

      #${SCRIPT_ID} .pu-tab.is-active {
        background: rgba(255, 69, 0, 0.12);
        color: #ff4500;
      }

      #${SCRIPT_ID} .pu-status {
        margin: 0 0 12px;
        color: #6b7280;
        font-size: 13px;
      }

      #${SCRIPT_ID} .pu-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      #${SCRIPT_ID} .pu-card {
        display: block;
        padding: 12px;
        border: 1px solid #edeff1;
        border-radius: 10px;
        background: #fff;
        color: inherit;
        text-decoration: none;
      }

      #${SCRIPT_ID} .pu-card:hover {
        border-color: #ff4500;
      }

      #${SCRIPT_ID} .pu-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 6px;
        font-size: 12px;
        color: #6b7280;
      }

      #${SCRIPT_ID} .pu-subreddit {
        color: #ff4500;
        font-weight: 700;
      }

      #${SCRIPT_ID} .pu-title {
        margin: 0 0 6px;
        color: #111827;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.4;
      }

      #${SCRIPT_ID} .pu-body {
        margin: 0;
        color: #111827;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      #${SCRIPT_ID} .pu-more {
        display: none;
        margin: 12px auto 0;
        padding: 10px 16px;
        background: #f6f7f8;
        color: #111827;
        font-weight: 700;
      }

      #${SCRIPT_ID} .pu-more.is-visible {
        display: block;
      }

      @media (prefers-color-scheme: dark) {
        #${SCRIPT_ID} .pu-shell,
        #${SCRIPT_ID} .pu-card {
          background: #1a1a1b;
          border-color: #343536;
        }

        #${SCRIPT_ID} .pu-tab,
        #${SCRIPT_ID} .pu-more {
          background: #272729;
          color: #d7dadc;
        }

        #${SCRIPT_ID} .pu-title,
        #${SCRIPT_ID} .pu-body {
          color: #d7dadc;
        }

        #${SCRIPT_ID} .pu-status,
        #${SCRIPT_ID} .pu-meta {
          color: #9ca3af;
        }
      }
    `;

    document.head.appendChild(style);
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}`);
    }
    return response.json();
  };

  const fetchPosts = async (username, after) => {
    let url = `https://www.reddit.com/search.json?q=author%3A${encodeURIComponent(username)}&type=link&limit=25&sort=new&raw_json=1`;
    if (after) url += `&after=${encodeURIComponent(after)}`;

    const json = await fetchJson(url);
    return {
      items: (json.data?.children || []).map((child) => child.data),
      after: json.data?.after || null,
    };
  };

  const findCommentByAuthor = (children, username) => {
    for (const child of children || []) {
      if (child.kind === "t1" && child.data?.author === username && child.data?.body) {
        return child.data;
      }

      const replies = child.data?.replies?.data?.children;
      if (replies?.length) {
        const nested = findCommentByAuthor(replies, username);
        if (nested) return nested;
      }
    }

    return null;
  };

  const hydrateComment = async (stub, username) => {
    try {
      const postId = String(stub.link_id || "").replace(/^t3_/, "") || String(stub.permalink || "").split("/").filter(Boolean)[3];
      if (!postId || !stub.subreddit) return null;

      const threadUrl = `https://www.reddit.com/r/${encodeURIComponent(stub.subreddit)}/comments/${postId}.json?limit=500&raw_json=1`;
      const data = await fetchJson(threadUrl);
      const threadChildren = data[1]?.data?.children || [];
      const comment = findCommentByAuthor(threadChildren, username);
      if (!comment) return null;

      return {
        ...stub,
        body: comment.body || stub.body || "",
        permalink: comment.permalink || stub.permalink,
        link_title: comment.link_title || stub.link_title || stub.title || "View thread",
      };
    } catch {
      return null;
    }
  };

  const fetchComments = async (username, after) => {
    const query = encodeURIComponent(`Author:"${username}"`);
    let url = `https://www.reddit.com/search.json?q=${query}&type=comment&limit=25&sort=new&raw_json=1`;
    if (after) url += `&after=${encodeURIComponent(after)}`;

    const json = await fetchJson(url);
    const stubs = (json.data?.children || []).map((child) => child.data);
    const hydrated = await Promise.all(stubs.map((stub) => hydrateComment(stub, username)));

    return {
      items: hydrated.filter(Boolean),
      after: json.data?.after || null,
    };
  };

  const buildCommentUrl = (comment) => {
    const match = String(comment.permalink || "").match(/\/comments\/([a-z0-9]+)\/[^/]*\/([a-z0-9]+)/i);
    if (match) {
      return `https://www.reddit.com/r/${encodeURIComponent(comment.subreddit)}/comments/${match[1]}/_/${match[2]}/?context=3`;
    }
    return `https://www.reddit.com${comment.permalink || ""}?context=3`;
  };

  const renderPost = (post) => `
    <a class="pu-card" href="https://www.reddit.com${esc(post.permalink)}" target="_blank" rel="noopener noreferrer">
      <div class="pu-meta">
        <span class="pu-subreddit">${esc(post.subreddit_name_prefixed || `r/${post.subreddit || ""}`)}</span>
        <span>${timeAgo(post.created_utc)}</span>
        <span>${formatScore(post.score)} pts</span>
        <span>${Number(post.num_comments || 0)} comments</span>
      </div>
      <p class="pu-title">${esc(post.title || "Untitled post")}</p>
    </a>
  `;

  const renderComment = (comment) => `
    <a class="pu-card" href="${esc(buildCommentUrl(comment))}" target="_blank" rel="noopener noreferrer">
      <div class="pu-meta">
        <span class="pu-subreddit">${esc(comment.subreddit_name_prefixed || `r/${comment.subreddit || ""}`)}</span>
        <span>${timeAgo(comment.created_utc)}</span>
        <span>${formatScore(comment.score)} pts</span>
      </div>
      <p class="pu-title">${esc(comment.link_title || "View thread")}</p>
      <p class="pu-body">${esc(String(comment.body || "").slice(0, 320))}${String(comment.body || "").length > 320 ? "…" : ""}</p>
    </a>
  `;

  const createApp = (username, anchor) => {
    const root = document.createElement("section");
    root.id = SCRIPT_ID;
    root.innerHTML = `
      <div class="pu-shell">
        <div class="pu-topbar">
          <div class="pu-brand">Profile Unhider · u/${esc(username)}</div>
          <button class="pu-button" type="button">Reveal activity</button>
        </div>
        <div class="pu-panel">
          <div class="pu-tabs">
            <button class="pu-tab is-active" type="button" data-tab="posts">Posts</button>
            <button class="pu-tab" type="button" data-tab="comments">Comments</button>
          </div>
          <p class="pu-status">Ready.</p>
          <div class="pu-list"></div>
          <button class="pu-more" type="button">Load more</button>
        </div>
      </div>
    `;

    anchor.parentElement?.insertBefore(root, anchor);
    anchor.style.display = "none";

    const button = root.querySelector(".pu-button");
    const panel = root.querySelector(".pu-panel");
    const status = root.querySelector(".pu-status");
    const list = root.querySelector(".pu-list");
    const more = root.querySelector(".pu-more");
    const tabs = Array.from(root.querySelectorAll(".pu-tab"));

    const state = {
      open: false,
      activeTab: "posts",
      posts: { items: [], after: null, loaded: false },
      comments: { items: [], after: null, loaded: false },
    };

    const setStatus = (message) => {
      status.textContent = message;
    };

    const render = () => {
      const bucket = state[state.activeTab];
      list.innerHTML = bucket.items.length
        ? bucket.items.map((item) => state.activeTab === "posts" ? renderPost(item) : renderComment(item)).join("")
        : "";

      if (!bucket.items.length) {
        setStatus(`No ${state.activeTab} found for u/${username}.`);
      }

      more.classList.toggle("is-visible", Boolean(bucket.after));
    };

    const loadTab = async (tab, append = false) => {
      state.activeTab = tab;
      tabs.forEach((element) => element.classList.toggle("is-active", element.dataset.tab === tab));

      const bucket = state[tab];
      setStatus(tab === "comments" ? "Fetching comments…" : "Fetching posts…");
      more.disabled = true;

      try {
        const result = tab === "posts"
          ? await fetchPosts(username, append ? bucket.after : null)
          : await fetchComments(username, append ? bucket.after : null);

        bucket.items = append ? bucket.items.concat(result.items) : result.items;
        bucket.after = result.after;
        bucket.loaded = true;

        render();
        if (bucket.items.length) {
          setStatus(`${bucket.items.length} ${tab} loaded.`);
        }
      } catch (error) {
        list.innerHTML = "";
        setStatus(`Failed to fetch ${tab}: ${error.message}`);
      } finally {
        more.disabled = false;
      }
    };

    button.addEventListener("click", async () => {
      state.open = !state.open;
      panel.classList.toggle("is-open", state.open);
      button.classList.toggle("is-active", state.open);
      button.textContent = state.open ? "Hide activity" : "Reveal activity";

      if (state.open && !state[state.activeTab].loaded) {
        await loadTab(state.activeTab);
      }
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", async () => {
        const nextTab = tab.dataset.tab;
        if (!nextTab || nextTab === state.activeTab) return;
        if (state[nextTab].loaded) {
          state.activeTab = nextTab;
          tabs.forEach((element) => element.classList.toggle("is-active", element.dataset.tab === nextTab));
          render();
          setStatus(`${state[nextTab].items.length} ${nextTab} loaded.`);
          return;
        }
        await loadTab(nextTab);
      });
    });

    more.addEventListener("click", async () => {
      if (!state[state.activeTab].after) return;
      more.textContent = "Loading…";
      await loadTab(state.activeTab, true);
      more.textContent = "Load more";
    });
  };

  const inject = () => {
    if (document.getElementById(SCRIPT_ID)) return;

    const username = getUsername();
    if (!username || !isHiddenProfile()) return;

    const anchor = findAnchor();
    if (!anchor) return;

    ensureStyle();
    createApp(username, anchor);
  };

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    inject();
    if (document.getElementById(SCRIPT_ID) || attempts >= 20) {
      window.clearInterval(timer);
    }
  }, 600);

  let lastPath = window.location.pathname;
  new MutationObserver(() => {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) existing.remove();

    window.setTimeout(inject, 1000);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
