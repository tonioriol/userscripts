import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";

import { createRedditBotBuster } from "./redditslopsleuth.user.js";

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

  engine = createRedditBotBuster({ win: window, doc: document, fetchFn });

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

describe("RedditBotBuster", () => {
  describe("scoring", () => {
    it("scores suspicious usernames", () => {
      const r1 = engine.scoreUsername("SomeBot");
      const r2 = engine.scoreUsername("John-Doe1234");
      expect(r1.score).toBeGreaterThan(0);
      expect(r2.score).toBeGreaterThan(0);
    });

    it("scores AI self-disclosure in text", () => {
      const text =
        "As an AI language model I can help you with this question. " +
        "Here is additional content that makes the message long enough to analyze properly.";
      const s = engine.scoreTextSignals(text);
      expect(s.ai.score).toBeGreaterThanOrEqual(10);
      expect(s.ai.reasons.join(" ")).toContain("self-disclosed");
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
  });

  describe("profile fetch", () => {
    it("fetches /about.json and caches", async () => {
      const p1 = await engine.__test.getUserProfile("SomeUser");
      const p2 = await engine.__test.getUserProfile("SomeUser");

      expect(p1).toBeTruthy();
      expect(p2).toBeTruthy();
      expect(fetchCalls.filter((u) => u.includes("/user/SomeUser/about.json")).length).toBe(1);
    });
  });

  describe("DOM scan + badge", () => {
    it("injects a clickable badge next to a username", async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="comment">
          <a class="author">SomeBot1234</a>
          <div class="md"><p>lol</p></div>
        </div>
      `;

      await engine.scanRoot(root);

      const badge = root.querySelector('[data-rbb-badge="true"]');
      expect(badge).toBeTruthy();

      const author = root.querySelector(".author");
      expect(author.nextElementSibling).toBe(badge);
    });

    it("opens the side panel when clicking a badge", async () => {
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

      const badge = root.querySelector('[data-rbb-badge="true"]');
      expect(badge).toBeTruthy();

      badge.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

      const drawer = document.querySelector(".rbb-drawer");
      expect(drawer).toBeTruthy();
      expect(drawer.style.display).toBe("block");
    });
  });
});
