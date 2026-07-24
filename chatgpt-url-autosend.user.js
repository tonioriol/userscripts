// ==UserScript==
// @name         ChatGPT URL Autosend
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.1.0
// @description  Prefill and optionally submit ChatGPT prompts from URL parameters
// @author       Toni Oriol
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/chatgpt-url-autosend.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/chatgpt-url-autosend.user.js
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_NAME = "ChatGPT URL Autosend";
  const PROMPT_PARAMS = ["q", "prompt"];
  const AUTOSEND_PARAM = "autosend";
  const TRUE_AUTOSEND_VALUES = new Set(["1", "true", "yes"]);
  const POLL_INTERVAL_MS = 100;
  const COMPOSER_ATTEMPTS = 100;
  const SEND_ATTEMPTS = 100;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const parseLaunchRequest = (href) => {
    const url = new URL(href);
    const promptParam = PROMPT_PARAMS.find((name) => url.searchParams.has(name));
    if (!promptParam) return null;

    const prompt = (url.searchParams.get(promptParam) || "").trim();
    if (!prompt) return null;

    const autosendValue = (url.searchParams.get(AUTOSEND_PARAM) || "").toLowerCase();
    const consumedParams = PROMPT_PARAMS.filter((name) => url.searchParams.has(name));

    if (url.searchParams.has(AUTOSEND_PARAM)) {
      consumedParams.push(AUTOSEND_PARAM);
    }

    return {
      prompt,
      autosend: TRUE_AUTOSEND_VALUES.has(autosendValue),
      consumedParams,
    };
  };

  const cleanConsumedParams = (href, consumedParams) => {
    const url = new URL(href);
    consumedParams.forEach((name) => url.searchParams.delete(name));
    return url.href;
  };

  const isEnabledButton = (button) => Boolean(button && !button.disabled);

  const findComposer = (root = document) => {
    const primary = root.querySelector("#prompt-textarea");
    if (primary) return primary;

    return [...root.querySelectorAll("textarea, [contenteditable='true']")].find((element) =>
      element.closest("form")
    ) || null;
  };

  const findSendButton = (composer, root = document) => {
    const selectors = [
      '[data-testid="send-button"]',
      '[data-testid="composer-submit-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
    ];

    for (const selector of selectors) {
      const button = root.querySelector(selector);
      if (isEnabledButton(button)) return button;
    }

    const fallback = composer?.closest("form")?.querySelector('button[type="submit"]');
    return isEnabledButton(fallback) ? fallback : null;
  };

  const setTextareaValue = (textarea, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    );

    descriptor?.set?.call(textarea, value);
  };

  const insertIntoContentEditable = (element, prompt) => {
    element.focus();

    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    if (!document.execCommand?.("insertText", false, prompt)) {
      element.textContent = prompt;
    }
  };

  const insertPrompt = (composer, prompt) => {
    composer.focus();

    if (composer instanceof HTMLTextAreaElement) {
      setTextareaValue(composer, prompt);
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    insertIntoContentEditable(composer, prompt);
    composer.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: prompt,
      })
    );
  };

  const waitForComposer = async () => {
    for (let i = 0; i < COMPOSER_ATTEMPTS; i += 1) {
      const composer = findComposer();
      if (composer) return composer;
      await wait(POLL_INTERVAL_MS);
    }

    return null;
  };

  const waitForSendButton = async (composer) => {
    for (let i = 0; i < SEND_ATTEMPTS; i += 1) {
      const button = findSendButton(composer);
      if (button) return button;
      await wait(POLL_INTERVAL_MS);
    }

    return null;
  };

  const replaceCurrentUrl = (nextHref) => {
    history.replaceState(history.state, document.title, nextHref);
  };

  const runChatGptUrlAutosend = async () => {
    const request = parseLaunchRequest(location.href);
    if (!request) return false;

    const composer = await waitForComposer();
    if (!composer) {
      console.warn(`[${SCRIPT_NAME}] Prompt box not found.`);
      return false;
    }

    insertPrompt(composer, request.prompt);

    if (!request.autosend) {
      replaceCurrentUrl(cleanConsumedParams(location.href, request.consumedParams));
      return true;
    }

    const sendButton = await waitForSendButton(composer);
    if (!sendButton) {
      console.warn(`[${SCRIPT_NAME}] Send button not found.`);
      return false;
    }

    sendButton.click();
    replaceCurrentUrl(cleanConsumedParams(location.href, request.consumedParams));
    return true;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseLaunchRequest,
      cleanConsumedParams,
      insertPrompt,
      findComposer,
      findSendButton,
      runChatGptUrlAutosend,
    };
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    runChatGptUrlAutosend().catch((error) => {
      console.warn(`[${SCRIPT_NAME}] Failed to process URL prompt:`, error);
    });
  }
})();
