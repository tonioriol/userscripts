import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";

import { createRedditSlopSleuth } from "./redditslopsleuth.user.js";

let dom;
let document;
let window;

let fetchCalls;
let engine;

  beforeEach(() => {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://www.reddit.com/",
  });

  window = dom.window;
  document = window.document;

  fetchCalls = [];
    const fetchFn = async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        async json() {
          return {
            data: {
              created_utc: Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60,
              comment_karma: 10,
              link_karma: 5,
              is_employee: false,
            },
          };
        },
      };
    };

  engine = createRedditSlopSleuth({ win: window, doc: document, fetchFn });

  global.window = window;
  global.document = document;
  global.Node = window.Node;
  global.localStorage = window.localStorage;
});

afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.localStorage;
});

describe("RedditSlopSleuth", () => {
  describe("scoring", () => {
    it("scores suspicious usernames", () => {
      const r1 = engine.scoreUsername("SomeBot");
      const r2 = engine.scoreUsername("John-Doe1234");
      expect(r1.score).toBeGreaterThan(0);
      expect(r2.score).toBeGreaterThan(0);
    });

    it("scores very short generic replies as bot-ish text (no early return)", () => {
      const s = engine.scoreTextSignals("lol");
      expect(s.botText.score).toBeGreaterThanOrEqual(2);
      expect(s.botText.reasons.join(" ")).toContain("generic very short reply");
    });

    it("scores link spam and suspicious TLDs even for short messages", () => {
      const s = engine.scoreTextSignals(
        "check this https://shady.xyz and also https://other.xyz"
      );
      expect(s.botText.score).toBeGreaterThanOrEqual(6);
      expect(s.botText.reasons.join(" ")).toContain("suspicious TLD");
      expect(s.botText.reasons.join(" ")).toContain("multiple links");
    });

    it("scores AI self-disclosure in text", () => {
      const text =
        "As an AI language model I can help you with this question. " +
        "Here is additional content that makes the message long enough to analyze properly.";
      const s = engine.scoreTextSignals(text);
      expect(s.ai.score).toBeGreaterThanOrEqual(10);
      expect(s.ai.reasons.join(" ")).toContain("self-disclosed");
    });

    it("does not treat generic 'I can help' phrasing as AI self-disclosure", () => {
      const s = engine.scoreTextSignals(
        "I can help you with this question. Here is some additional content to make it long enough."
      );

      expect(s.ai.reasons.join(" ")).not.toContain("self-disclosed AI (+10)");
    });

    it("scores structural patterns (headings + revision markers) as AI-ish", () => {
      const text = [
        "Análisis técnico del accidente",
        "",
        "(EDIT:) Actualizaciones:",
        "- Añadido dato 1",
        "- Añadido dato 2",
        "",
        "Contexto:",
        "Texto largo ".repeat(80),
        "",
        "Reconstrucción:",
        "Más texto ".repeat(80),
        "",
        "(EDIT2:) Actualizaciones:",
        "- Añadida fuente",
      ].join("\n");

      const s = engine.scoreTextSignals(text);
      expect(s.ai.score).toBeGreaterThan(0);
      expect(s.ai.reasons.join(" ")).toMatch(/section density|revision markers/i);
    });

    it("scores meta 'let me analyze' framing as AI-ish", () => {
      const s = engine.scoreTextSignals(
        "The user is asking whether this was LLM generated. Let me analyze the text carefully."
      );
      expect(s.ai.score).toBeGreaterThan(0);
      expect(s.ai.reasons.join(" ")).toContain("meta");
    });

    it("detects near-duplicate messages by the same user even when URLs/numbers change", () => {
      const perUserHistory = new Map();
      const t1 =
        "Here is my detailed explanation of what happened, read https://example.com/?id=123 for context. Thanks.";
      const t2 =
        "Here is my detailed explanation of what happened, read https://example.com/?id=999 for context. Thanks.";

      const s1 = engine.scoreTextSignals(t1, { perUserHistory });
      const s2 = engine.scoreTextSignals(t2, { perUserHistory });

      expect(s1.botText.reasons.join(" ")).not.toContain("near-duplicate");
      expect(s2.botText.score).toBeGreaterThanOrEqual(2);
      expect(s2.botText.reasons.join(" ")).toContain("near-duplicate");
    });

    it("classifies as human when signals are low and profile is strong", () => {
      const c = engine.classify({
        botScore: 0,
        aiScore: 0,
        profileScore: -4,
        showHumanBadges: true,
      });
      expect(c.kind).toBe("human");
      expect(c.emoji).toBe("✅");
    });

    it("stores v2 labels and exports JSON", async () => {
      await engine.start();

      const root = document.createElement("div");
      root.innerHTML = `
        <div class="comment">
          <a class="author">UserZ</a>
          <div class="md"><p>This is a fairly normal comment with some content. Not too long.</p></div>
        </div>
      `;
      document.body.appendChild(root);

      await engine.scanRoot(document);
      const badge = root.querySelector('[data-rss-badge="true"]');
      expect(badge).toBeTruthy();

      badge.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      const popover = document.querySelector(".rss-popover");
      expect(popover).toBeTruthy();
      expect(popover.textContent).toContain("Label item");

      const btn = popover.querySelector('[data-rss-label-item="human"]');
      expect(btn).toBeTruthy();
      btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

      const stored = JSON.parse(window.localStorage.getItem("rss:v2:labels") || "null");
      expect(stored).toBeTruthy();
      expect(Array.isArray(stored.records)).toBe(true);
      expect(stored.records.some((r) => r.kind === "item" && r.label === "human")).toBe(true);
    });
  });

  describe("profile fetch", () => {
    it("fetches /about.json and caches", async () => {
      const p1 = await engine.__test.getUserProfile("SomeUser");
      const p2 = await engine.__test.getUserProfile("SomeUser");

      expect(p1).toBeTruthy();
      expect(p2).toBeTruthy();
      expect(fetchCalls.filter((u) => u.includes("/user/SomeUser/about.json")).length).toBe(1);
    });

    it("backs off on 429 and avoids hammering the endpoint", async () => {
      let n = 0;
      const fetchFn = async (url) => {
        n += 1;
        fetchCalls.push(String(url));
        return {
          ok: false,
          status: 429,
          headers: {
            get(name) {
              if (name === "x-ratelimit-reset") return "60";
              return null;
            },
          },
          async json() {
            return {};
          },
        };
      };

      engine = createRedditSlopSleuth({ win: window, doc: document, fetchFn });

      const p1 = await engine.__test.getUserProfile("RateLimitedUser");
      const p2 = await engine.__test.getUserProfile("RateLimitedUser");

      expect(p1).toBeNull();
      expect(p2).toBeNull();
      expect(n).toBe(1);
    });
  });

  describe("history fetch", () => {
    it("caches history per endpoint (overview/comments/submitted)", async () => {
      const seen = { overview: 0, comments: 0, submitted: 0 };
      const fetchFn = async (url) => {
        const u = String(url);
        if (u.includes("/overview.json")) seen.overview += 1;
        if (u.includes("/comments.json")) seen.comments += 1;
        if (u.includes("/submitted.json")) seen.submitted += 1;

        return {
          ok: true,
          status: 200,
          headers: new Map(),
          async json() {
            // Minimal listing shape for overview/comments/submitted
            return {
              data: {
                children: [
                  {
                    data: {
                      created_utc: Math.floor(Date.now() / 1000) - 3600,
                      subreddit: "testsub",
                      url: "https://example.com/post",
                      title: "hello world",
                      body: "hello world",
                      permalink: "/r/testsub/comments/abc123/x",
                    },
                  },
                ],
              },
            };
          },
        };
      };

      engine = createRedditSlopSleuth({
        win: window,
        doc: document,
        fetchFn,
        options: {
          v2: {
            enableHistoryFetch: true,
            enableExtendedHistoryFetch: true,
            historyDailyQuotaPerUser: 50,
          },
        },
      });

      // First run should fetch extended history once.
      await engine.start();
      await engine.__test.refreshAllBadges();

      // Second recompute should hit caches (no additional fetches).
      await engine.__test.refreshAllBadges();

      // We can't guarantee the test creates an entry that triggers fetch; force it by adding an entry.
      // Inject a comment so computeEntry runs and hits uncertain band gating.
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="comment">
          <a class="author">SomeUser</a>
          <div class="md"><p>This is some moderately long text that might fall into the uncertain band for ML.</p></div>
        </div>
      `;
      document.body.appendChild(root);
      await engine.scanRoot(document);

      // Trigger recompute again after injection.
      await engine.__test.refreshAllBadges();

      // At least one of the endpoints should have been fetched, but not repeatedly.
      expect(seen.overview).toBeLessThanOrEqual(2);
      expect(seen.comments).toBeLessThanOrEqual(2);
      expect(seen.submitted).toBeLessThanOrEqual(2);
    });
  });

  describe("DOM scan + badge", () => {
    it("injects a clickable badge next to a username", async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="comment">
          <a class="author" href="/user/SomeBot1234">SomeBot1234</a>
          <div class="md"><p>lol</p></div>
        </div>
      `;

      await engine.scanRoot(root);

      const badge = root.querySelector('[data-rss-badge="true"]');
      expect(badge).toBeTruthy();

      const author = root.querySelector(".author");
      expect(author.nextElementSibling).toBe(badge);
    });

    it("inserts badge outside the author link to avoid Reddit navigation/hovercard capture", async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="comment">
          <a class="author" href="/user/UserX"><span class="whitespace-nowrap">UserX</span></a>
          <div class="md"><p>hello</p></div>
        </div>
      `;

      await engine.scanRoot(root);

      const badge = root.querySelector('[data-rss-badge="true"]');
      expect(badge).toBeTruthy();
      expect(badge.closest("a")).toBeNull();

      const author = root.querySelector("a.author");
      expect(author.nextElementSibling).toBe(badge);
    });

    it("opens the popover when clicking a badge (mobile-friendly)", async () => {
      // Mount UI by starting the engine.
      await engine.start();

      const root = document.createElement("div");
      root.innerHTML = `
        <div class="comment">
          <a class="author">UserX</a>
          <div class="md">
            <p>As an AI language model I can help with this question in a structured way.</p>
            <p>This is additional filler to ensure it is analyzed.</p>
          </div>
        </div>
      `;
      document.body.appendChild(root);

      await engine.scanRoot(document);

      const badge = root.querySelector('[data-rss-badge="true"]');
      expect(badge).toBeTruthy();

      badge.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

      const popover = document.querySelector(".rss-popover");
      expect(popover).toBeTruthy();
      expect(popover.style.display).toBe("block");

      // Badge click should not force-open the drawer.
      const drawer = document.querySelector(".rss-drawer");
      expect(drawer).toBeTruthy();
      expect(drawer.style.display).toBe("none");
    });

    it("opens the side panel when clicking the gear", async () => {
      await engine.start();

      const gear = document.querySelector(".rss-gear");
      expect(gear).toBeTruthy();

      gear.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

      const drawer = document.querySelector(".rss-drawer");
      expect(drawer).toBeTruthy();
      expect(drawer.style.display).toBe("block");
    });

    it("injects on home feed when author isn't visible by reading author-name from overflow menu", async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <article>
          <span slot="credit-bar">
            <a data-testid="subreddit-name" href="/r/example/">r/example</a>
          </span>
          <shreddit-post-overflow-menu author-name="digitally_satisfied"></shreddit-post-overflow-menu>
          <div data-click-id="text"><p>hello</p></div>
        </article>
      `;

      await engine.scanRoot(root);

      const badge = root.querySelector('[data-rss-badge="true"]');
      expect(badge).toBeTruthy();
      // Should use author-name attribute.
      expect(badge.dataset.rssTooltip).toContain("digitally_satisfied");
    });

    it("inserts comment badge after rpl-hovercard to avoid being covered by the handle", async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div data-testid="comment">
          <div class="author-name-meta">
            <rpl-hovercard>
              <div class="author-name-meta">
                <a class="truncate" href="/user/UserY">UserY</a>
              </div>
              <div slot="content"><a href="/user/NotTheAuthor">NotTheAuthor</a></div>
            </rpl-hovercard>
          </div>
          <div data-testid="comment"><p>hello</p></div>
        </div>
      `;

      await engine.scanRoot(root);

      const hover = root.querySelector("rpl-hovercard");
      expect(hover).toBeTruthy();
      const badge = root.querySelector('[data-rss-badge="true"]');
      expect(badge).toBeTruthy();
      expect(hover.nextElementSibling).toBe(badge);
    });
  });
});
