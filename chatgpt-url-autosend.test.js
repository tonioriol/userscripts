import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseLaunchRequest,
  cleanConsumedParams,
  insertPrompt,
  findComposer,
  findSendButton,
} from "./chatgpt-url-autosend.user.js";

let dom;

const resetDom = (html = "") => {
  document.body.innerHTML = html;
};

describe("ChatGPT URL Autosend helpers", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    global.document = dom.window.document;
    global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    global.InputEvent = dom.window.InputEvent;
    global.Event = dom.window.Event;
    global.getSelection = dom.window.getSelection.bind(dom.window);
    resetDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDom();
  });

  describe("parseLaunchRequest", () => {
    it("prefers q over prompt and records consumed params", () => {
      const request = parseLaunchRequest(
        "https://chatgpt.com/?prompt=fallback&q=primary&autosend=1&keep=1"
      );

      expect(request).toEqual({
        prompt: "primary",
        autosend: true,
        consumedParams: ["q", "prompt", "autosend"],
      });
    });

    it.each(["1", "true", "yes", "TRUE", "Yes"])(
      "treats autosend=%s as enabled",
      (value) => {
        expect(
          parseLaunchRequest(`https://chatgpt.com/?q=hello&autosend=${value}`)
            .autosend
        ).toBe(true);
      }
    );

    it("leaves autosend disabled for any other value", () => {
      expect(
        parseLaunchRequest("https://chatgpt.com/?q=hello&autosend=0").autosend
      ).toBe(false);
    });

    it("returns null for empty prompts", () => {
      expect(parseLaunchRequest("https://chatgpt.com/?q=%20%20")).toBeNull();
      expect(parseLaunchRequest("https://chatgpt.com/?prompt=")).toBeNull();
    });
  });

  describe("cleanConsumedParams", () => {
    it("removes only consumed params and preserves unrelated params plus hash", () => {
      expect(
        cleanConsumedParams(
          "https://chatgpt.com/?q=hello&autosend=1&keep=1#thread",
          ["q", "autosend"]
        )
      ).toBe("https://chatgpt.com/?keep=1#thread");
    });

    it("removes the question mark when no query params remain", () => {
      expect(
        cleanConsumedParams("https://chatgpt.com/?q=hello", ["q"])
      ).toBe("https://chatgpt.com/");
    });
  });

  describe("findComposer", () => {
    it("finds the primary ChatGPT prompt textarea", () => {
      resetDom('<form><textarea id="prompt-textarea"></textarea></form>');
      expect(findComposer()).toBe(document.querySelector("#prompt-textarea"));
    });

    it("finds a contenteditable composer inside a form", () => {
      resetDom('<form><div contenteditable="true"></div></form>');
      expect(findComposer()).toBe(document.querySelector('[contenteditable="true"]'));
    });
  });

  describe("insertPrompt", () => {
    it("sets textarea value and dispatches an input event", () => {
      resetDom('<form><textarea id="prompt-textarea"></textarea></form>');
      const textarea = document.querySelector("textarea");
      const inputHandler = vi.fn();
      textarea.addEventListener("input", inputHandler);

      insertPrompt(textarea, "Hello ChatGPT");

      expect(textarea.value).toBe("Hello ChatGPT");
      expect(inputHandler).toHaveBeenCalledTimes(1);
    });

    it("inserts into contenteditable elements and dispatches input", () => {
      resetDom('<form><div contenteditable="true"></div></form>');
      const editor = document.querySelector('[contenteditable="true"]');
      const inputHandler = vi.fn();
      editor.addEventListener("input", inputHandler);

      insertPrompt(editor, "Hello editable");

      expect(editor.textContent).toBe("Hello editable");
      expect(inputHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("findSendButton", () => {
    it("finds enabled ChatGPT send buttons", () => {
      resetDom('<button data-testid="composer-submit-button"></button>');
      expect(findSendButton()).toBe(
        document.querySelector('[data-testid="composer-submit-button"]')
      );
    });

    it("ignores disabled global buttons and falls back to form submit", () => {
      resetDom(`
        <button data-testid="send-button" disabled></button>
        <form><textarea id="prompt-textarea"></textarea><button type="submit"></button></form>
      `);
      const composer = document.querySelector("textarea");
      expect(findSendButton(composer)).toBe(document.querySelector('button[type="submit"]'));
    });
  });
});
