// ==UserScript==
// @name         GoMetric
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.1.1
// @description  Automatically converts imperial units to metric units and currencies
// @author       Toni Oriol
// @match        *://*/*
// @icon         📏
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/gometric.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/gometric.user.js
// ==/UserScript==

(() => {
  "use strict";

  // ============ CONFIGURATION ============
  const HOME_CURRENCY = "EUR"; // Change to your preferred currency (USD, EUR, GBP, etc.)
  // ======================================

  let exchangeRates = null;

  // Currency symbols mapping
  const currencySymbols = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "₽": "RUB",
    "₩": "KRW",
    "₪": "ILS",
    "₺": "TRY",
  };

  // Fetch exchange rates
  const fetchRates = async () => {
    if (exchangeRates) return exchangeRates;

    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${HOME_CURRENCY.toLowerCase()}.json`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      exchangeRates = data[HOME_CURRENCY.toLowerCase()];
      return exchangeRates;
    } catch (error) {
      console.error("GoMetric: Currency API failed", error);
      return null;
    }
  };

  // Get symbol for currency
  const getSymbol = (code) => {
    const symbols = { usd: "$", eur: "€", gbp: "£", jpy: "¥", cny: "¥" };
    return symbols[code.toLowerCase()] || code.toUpperCase();
  };

  // Scaling modes with their allowed metric prefixes
  const scales = {
    none: [],
    standard: [
      { threshold: 1e12, prefix: "T", divisor: 1e12 },
      { threshold: 1e9, prefix: "G", divisor: 1e9 },
      { threshold: 1e6, prefix: "M", divisor: 1e6 },
      { threshold: 1e3, prefix: "k", divisor: 1e3 },
      { threshold: 1e-3, prefix: "m", divisor: 1e-3 },
      { threshold: 1e-6, prefix: "µ", divisor: 1e-6 },
      { threshold: 1e-9, prefix: "n", divisor: 1e-9 },
      { threshold: 1e-12, prefix: "p", divisor: 1e-12 },
    ],
    withCenti: [
      { threshold: 1e12, prefix: "T", divisor: 1e12 },
      { threshold: 1e9, prefix: "G", divisor: 1e9 },
      { threshold: 1e6, prefix: "M", divisor: 1e6 },
      { threshold: 1e3, prefix: "k", divisor: 1e3 },
      { threshold: 1e-2, prefix: "c", divisor: 1e-2 },
      { threshold: 1e-3, prefix: "m", divisor: 1e-3 },
      { threshold: 1e-6, prefix: "µ", divisor: 1e-6 },
      { threshold: 1e-9, prefix: "n", divisor: 1e-9 },
      { threshold: 1e-12, prefix: "p", divisor: 1e-12 },
    ],
  };

  // Define all imperial to metric conversions
  const conversions = [
    // Temperature
    {
      pattern: "(?:F|fahrenheit|fahrenheits|degrees F|degrees fahrenheit)",
      unit: "℃",
      convert: (f) => ((f - 32) / 1.8).toFixed(2),
      scale: scales.none,
    },

    // Distance
    { pattern: "thou", unit: "m", factor: 25.4e-6, scale: scales.withCenti },
    {
      pattern: "(?:inch(?:es|e)?)",
      unit: "m",
      factor: 25.4e-3,
      scale: scales.withCenti,
    },
    {
      pattern: "(?:feets?|foot)",
      unit: "m",
      factor: 0.3048,
      scale: scales.withCenti,
    },
    {
      pattern: "(?:yards?|yd)",
      unit: "m",
      factor: 0.9144,
      scale: scales.withCenti,
    },
    { pattern: "chains?", unit: "m", factor: 20.1168, scale: scales.withCenti },
    {
      pattern: "(?:furlongs?|fur)",
      unit: "m",
      factor: 201.168,
      scale: scales.withCenti,
    },
    { pattern: "miles?", unit: "m", factor: 1609.344, scale: scales.withCenti },
    {
      pattern: "leagues?",
      unit: "m",
      factor: 4828.032,
      scale: scales.withCenti,
    },

    // Maritime
    {
      pattern: "(?:fathoms?|ftm)",
      unit: "m",
      factor: 1.853184,
      scale: scales.withCenti,
    },
    {
      pattern: "cables?",
      unit: "m",
      factor: 185.3184,
      scale: scales.withCenti,
    },
    {
      pattern: "nautical\\smiles?",
      unit: "m",
      factor: 1853.184,
      scale: scales.withCenti,
    },

    // Survey
    { pattern: "link", unit: "m", factor: 0.201168, scale: scales.withCenti },
    { pattern: "rod", unit: "m", factor: 5.0292, scale: scales.withCenti },

    // Area
    {
      pattern: "acres?",
      unit: "km²",
      factor: 4.0468564224,
      scale: scales.none,
    },
    {
      pattern: "(?:sq ft|square feet|ft²)",
      unit: "m²",
      factor: 0.092903,
      scale: scales.none,
    },
    {
      pattern: "(?:sq yd|square yards|yd²)",
      unit: "m²",
      factor: 0.836127,
      scale: scales.none,
    },
    {
      pattern: "(?:sq mi|square miles|mi²)",
      unit: "km²",
      factor: 2.58999,
      scale: scales.none,
    },

    // Volume
    {
      pattern: "(?:fluid ounces?|fl oz)",
      unit: "L",
      factor: 28.4130625e-3,
      scale: scales.withCenti,
    },
    {
      pattern: "gill?",
      unit: "L",
      factor: 142.0653125e-3,
      scale: scales.withCenti,
    },
    {
      pattern: "(?:pints?|pt)",
      unit: "L",
      factor: 0.56826125,
      scale: scales.withCenti,
    },
    {
      pattern: "quarts?",
      unit: "L",
      factor: 1.1365225,
      scale: scales.withCenti,
    },
    {
      pattern: "gal(?:lons?)?",
      unit: "L",
      factor: 4.54609,
      scale: scales.withCenti,
    },

    // Cooking/Kitchen
    {
      pattern: "(?:cups?|c\\b)",
      unit: "L",
      factor: 0.236588,
      scale: scales.withCenti,
    },
    {
      pattern: "(?:tbsp|tablespoons?)",
      unit: "L",
      factor: 0.0147868,
      scale: scales.withCenti,
    },
    {
      pattern: "(?:tsp|teaspoons?)",
      unit: "L",
      factor: 0.00492892,
      scale: scales.withCenti,
    },

    // Weight (NOTE: lb-ft must come before lbs to avoid matching lb first)
    {
      pattern: "grains?",
      unit: "g",
      factor: 64.79891e-3,
      scale: scales.standard,
    },
    {
      pattern: "drachm",
      unit: "g",
      factor: 1.7718451953125,
      scale: scales.standard,
    },
    {
      pattern: "(?:ounces?|oz)",
      unit: "g",
      factor: 28.349523125,
      scale: scales.standard,
    },
    {
      pattern: "stones?",
      unit: "g",
      factor: 6350.29318,
      scale: scales.standard,
    },
    {
      pattern: "quarters?",
      unit: "g",
      factor: 12700.58636,
      scale: scales.standard,
    },
    {
      pattern: "hundredweights?",
      unit: "g",
      factor: 50802.34544,
      scale: scales.standard,
    },

    // Speed
    {
      pattern: "(?:mph|miles per hour)",
      unit: "km/h",
      factor: 1.609344,
      scale: scales.none,
    },
    {
      pattern: "(?:knots?|kt)",
      unit: "km/h",
      factor: 1.852,
      scale: scales.none,
    },
    {
      pattern: "(?:fps|feet per second)",
      unit: "m/s",
      factor: 0.3048,
      scale: scales.none,
    },

    // Pressure
    { pattern: "psi", unit: "Pa", factor: 6894.76, scale: scales.standard },
    {
      pattern: "(?:inHg|inches of mercury)",
      unit: "Pa",
      factor: 3386.39,
      scale: scales.standard,
    },
    { pattern: "bar", unit: "Pa", factor: 100000, scale: scales.standard },

    // Energy & Power
    { pattern: "btu", unit: "J", factor: 1055.06, scale: scales.standard },
    {
      pattern: "(?:hp|horsepower)",
      unit: "W",
      factor: 745.7,
      scale: scales.standard,
    },

    // Torque (MUST come before lb/lbs pattern)
    {
      pattern: "(?:lb-ft|pound-feet)",
      unit: "N⋅m",
      factor: 1.35582,
      scale: scales.none,
    },
    {
      pattern: "(?:ft-?lbs?|foot-pounds)",
      unit: "J",
      factor: 1.35582,
      scale: scales.standard,
    },

    // Weight continued (lb/lbs AFTER torque patterns)
    { pattern: "lbs?", unit: "g", factor: 453.59, scale: scales.standard },

    // Fuel Economy (inverse conversion)
    {
      pattern: "(?:mpg|miles per gallon)",
      unit: "L/100km",
      convert: (mpg) => (235.214583 / mpg).toFixed(2),
      scale: scales.none,
    },
  ];

  // Compile regex patterns once for performance
  conversions.forEach((rule) => {
    rule.regex = new RegExp(
      `(?:^|\\s)((\\d\\s)?[0-9]+(?:\\.[0-9]+)?(?:/[0-9]+(?:\\.[0-9]+)?)?)\\s*(${rule.pattern})\\b(?!(\\s\\[))`,
      "gi"
    );
  });

  // Parse numbers including fractions like "1 1/4" or "3/4"
  const parseNumber = (str) => {
    str = str.replace(/,/g, "");
    if (!str.includes("/")) return parseFloat(str);

    const parts = str.trim().split(/\s+/);

    // Handle mixed fractions like "1 1/4"
    if (parts.length === 2) {
      const wholePart = parseFloat(parts[0]);
      const [numerator, denominator] = parts[1].split("/").map(parseFloat);
      return wholePart + numerator / denominator;
    }

    // Handle simple fractions like "3/4"
    const [numerator, denominator] = parts[0].split("/").map(parseFloat);
    return numerator / denominator;
  };

  // Apply metric prefix scaling using scale array
  const scaleMetric = (value, unit, scalePrefixes) => {
    // No scaling if empty array
    if (!scalePrefixes || scalePrefixes.length === 0) {
      return { value, unit };
    }

    // Scale up for large values (T, G, M, k)
    for (const { threshold, prefix, divisor } of scalePrefixes) {
      if (threshold >= 1e3 && value >= threshold) {
        return { value: value / divisor, unit: prefix + unit };
      }
    }

    // Scale down for small values (c, m, µ, n, p)
    // Check from largest to smallest sub-unit prefix
    for (const { threshold, prefix, divisor } of scalePrefixes) {
      if (threshold < 1 && value >= threshold && value < 1) {
        return { value: value / divisor, unit: prefix + unit };
      }
    }

    return { value, unit };
  };

  // Transform currency
  const transformCurrency = async (text) => {
    const rates = await fetchRates();
    if (!rates) return text;

    // Match currency patterns: £583.80, $99.99, 50 USD
    const regex =
      /([£$€¥₹₽₩₪₺])\s*([0-9,]+(?:\.[0-9]{2})?)|([0-9,]+(?:\.[0-9]{2})?)\s*(USD|EUR|GBP|JPY|CNY)/gi;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (
        text[match.index + match[0].length] === " " &&
        text[match.index + match[0].length + 1] === "["
      )
        continue;

      const symbol = match[1];
      const amountAfter = match[2];
      const amountBefore = match[3];
      const code = match[4];

      const amount = parseFloat(
        (amountAfter || amountBefore).replace(/,/g, "")
      );
      const currency = currencySymbols[symbol] || code;

      if (currency && currency.toLowerCase() !== HOME_CURRENCY.toLowerCase()) {
        matches.push({
          original: match[0],
          index: match.index,
          amount,
          currency,
        });
      }
    }

    // Process in reverse to maintain indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const { original, index, amount, currency } = matches[i];
      const rate = rates[currency.toLowerCase()];

      if (rate) {
        const converted = Math.round((amount / rate) * 100) / 100;
        const sym = getSymbol(HOME_CURRENCY);
        const replacement = `${original} [${sym}${converted}]`;
        text =
          text.slice(0, index) +
          replacement +
          text.slice(index + original.length);
      }
    }

    return text;
  };

  // Main transformation function
  const transformText = (text) => {
    // Apply each conversion rule to the text
    conversions.forEach((rule) => {
      rule.regex.lastIndex = 0;
      let match;

      // Find all matches for this conversion rule
      while ((match = rule.regex.exec(text)) !== null) {
        const originalText = match[0];
        const matchPosition = match.index;

        // Step 1: Parse the imperial value
        const imperialValue = parseNumber(match[1]);

        // Step 2: Convert to metric
        const metricValue = rule.convert
          ? rule.convert(imperialValue)
          : imperialValue * rule.factor;

        // Step 3: Apply metric prefix scaling
        const scaled = scaleMetric(metricValue, rule.unit, rule.scale);

        // Step 4: Round to 2 decimal places
        const roundedValue = Math.round(scaled.value * 100) / 100;

        // Step 5: Build the replacement text
        const replacement = `${originalText} [${roundedValue} ${scaled.unit}]`;

        // Step 6: Replace in the original text
        const before = text.slice(0, matchPosition);
        const after = text.slice(matchPosition + originalText.length);
        text = before + replacement + after;

        // Step 7: Adjust regex position for next match
        rule.regex.lastIndex += replacement.length - originalText.length;
      }
    });

    return text;
  };

  // Process a single text node
  const processTextNode = async (node) => {
    let text = node.nodeValue;

    // Apply currency conversion
    text = await transformCurrency(text);

    // Apply unit conversions
    text = transformText(text);

    if (text !== node.nodeValue) {
      node.nodeValue = text;
    }
  };

  // Walk through all DOM nodes recursively
  const walkDOM = (node) => {
    // If it's a text node, process it
    if (node.nodeType === Node.TEXT_NODE) {
      processTextNode(node);
    }
    // If it's an element, document, or fragment, walk through its children
    else if (
      [
        Node.ELEMENT_NODE,
        Node.DOCUMENT_NODE,
        Node.DOCUMENT_FRAGMENT_NODE,
      ].includes(node.nodeType)
    ) {
      let child = node.firstChild;
      while (child) {
        const nextSibling = child.nextSibling;
        walkDOM(child);
        child = nextSibling;
      }
    }
  };

  // Initialize the script when DOM is ready
  if (typeof document !== "undefined" && document.body) {
    // Fetch rates on load
    fetchRates();

    // Process all existing content
    walkDOM(document.body);

    // Watch for dynamic content changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // New nodes added to the page
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(walkDOM);
        }
        // Text content changed
        else if (mutation.type === "characterData") {
          processTextNode(mutation.target);
        }
      });
    });

    // Start observing the document
    observer.observe(document, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Export for testing
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { transformText };
  }
})();
