// ==UserScript==
// @name         GoMetric
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.1.13
// @description  Automatically converts imperial units to metric units and currencies
// @author       Toni Oriol
// @match        *://*/*
// @icon         data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23FF9800%22%3E%3Cpath d=%22M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h2v8z%22/%3E%3C/svg%3E
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

  // Unified currency configuration
  const currencyConfig = {
    // each entry has code and optional symbol
    currencies: [
      { code: 'USD', symbol: '$', indicators: ['US$'] },
      { code: 'EUR', symbol: '€' },
      { code: 'GBP', symbol: '£' },
      { code: 'JPY', symbol: '¥' },
      { code: 'CNY', symbol: '¥' },
      { code: 'INR', symbol: '₹' },
      { code: 'RUB', symbol: '₽' },
      { code: 'KRW', symbol: '₩' },
      { code: 'ILS', symbol: '₪' },
      { code: 'TRY', symbol: '₺' },
      { code: 'THB', symbol: '฿' },
      { code: 'PHP', symbol: '₱' },
      { code: 'VND', symbol: '₫' },
      { code: 'PLN', symbol: 'zł' },
      { code: 'UAH', symbol: '₴' },
      { code: 'NGN', symbol: '₦' },
      { code: 'BRL', symbol: 'R$' },
      { code: 'ZAR', symbol: 'R' },
      // `indicators` lets us support composite indicators like "AUD $" (otherwise `$` would be USD).
      // Items are treated as *literal* strings (not regex), but whitespace is matched flexibly.
      { code: 'CHF', indicators: ['SFr', 'Fr.'] },
      { code: 'CAD', indicators: ['CA$', 'C$'] },
      { code: 'AUD', indicators: ['AUD $', 'AU$', 'A$'] },
      { code: 'NZD', indicators: ['NZ$'] },
      { code: 'HKD' }, { code: 'SGD' }, { code: 'SEK' }, { code: 'NOK' },
      { code: 'DKK' }, { code: 'MXN' }, { code: 'CZK' }, { code: 'HUF' },
      { code: 'AED' }, { code: 'SAR' }, { code: 'MYR' }, { code: 'IDR' },
      { code: 'TWD' }, { code: 'CLP' }, { code: 'COP' }, { code: 'PEN' },
      { code: 'ARS' }, { code: 'EGP' }, { code: 'PKR' }, { code: 'BDT' },
      { code: 'RON' }, { code: 'BGN' }, { code: 'HRK' }, { code: 'ISK' }
    ],
    // metric suffixes that can appear in currency amounts (e.g. 1.5B USD, $500M)
    multipliers: {
      k: 1e3, K: 1e3,
      M: 1e6, m: 1e6,
      B: 1e9, bn: 1e9, Bn: 1e9,
      T: 1e12, tn: 1e12, Tn: 1e12,
    },
  };

  // Build lookup maps and regex patterns from unified config
  const symbolToCode = Object.fromEntries(currencyConfig.currencies.filter(c => c.symbol).map(c => [c.symbol, c.code]));
  const codeToSymbol = Object.fromEntries(currencyConfig.currencies.filter(c => c.symbol).map(c => [c.code.toLowerCase(), c.symbol]));
  const codesPattern = currencyConfig.currencies.map(c => c.code).join('|');
  // Escape special regex chars in symbols for pattern matching
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const currencySymbols = currencyConfig.currencies.filter(c => c.symbol).map(c => c.symbol);
  // Treat 1-letter alphabetic symbols as ambiguous identifiers (e.g. "R"), require whitespace after them.
  // This avoids hardcoding specific symbols while preventing matches like "R1".
  const singleLetterAlphaSymbolsPattern = currencySymbols
    .filter(s => /^[A-Za-z]$/.test(s))
    .map(escapeRegex)
    .join('|');
  const nonSingleLetterAlphaSymbolsPattern = currencySymbols
    .filter(s => !/^[A-Za-z]$/.test(s))
    .map(escapeRegex)
    .join('|');

  // Additional currency indicators (e.g. "AUD $", "A$")
  // These are configured per currency via `indicators: [...]`.
  // Convert indicator literals to safe regex sources, matching any whitespace flexibly.
  const INDICATOR_WS_PATTERN = `[\\s\\u00A0\\u202F]*`;
  const INDICATOR_WS_RE = /[\s\u00A0\u202F]+/u;

  const normalizeIndicator = (s) => String(s ?? '').split(INDICATOR_WS_RE).join('').toUpperCase();

  const indicatorLiteralToPattern = (literal) => {
    const parts = String(literal ?? '').trim().split(INDICATOR_WS_RE).filter(Boolean);
    return parts.length ? parts.map(escapeRegex).join(INDICATOR_WS_PATTERN) : '';
  };

  const { indicatorAliasesPattern, indicatorAliasToCode } = (() => {
    const patterns = [];
    const map = {};

    for (const { code, indicators } of currencyConfig.currencies) {
      for (const literal of indicators || []) {
        const key = normalizeIndicator(literal);
        if (!key) continue;

        map[key] = code;

        const pattern = indicatorLiteralToPattern(literal);
        if (pattern) patterns.push(pattern);
      }
    }

    // Longest-first so composite indicators like "AUD $" win over plain "$".
    patterns.sort((a, b) => b.length - a.length);

    return {
      indicatorAliasesPattern: patterns.join('|'),
      indicatorAliasToCode: map,
    };
  })();

  const currencyMultiplierMap = currencyConfig.multipliers;
  const currencyMultiplierPattern = Object.keys(currencyMultiplierMap)
    // longest first so "bn" matches before "b"
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');
  const currencyMultiplierRegex = new RegExp(`(${currencyMultiplierPattern})$`);

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

  // Get symbol for currency (uses unified config)
  const getSymbol = (code) => codeToSymbol[code.toLowerCase()] || code.toUpperCase();

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
      pattern: "(?:sqft|sq ft|square feet|ft²)",
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
      `(?:^|\\s)((\\d\\s)?[0-9,]+(?:\\.[0-9]+)?(?:/[0-9]+(?:\\.[0-9]+)?)?)\\s*(${rule.pattern})\\b(?!(\\s\\[))`,
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

  // Parse currency amount with smart decimal detection
  // Supports: 1,234.56 | 1.234,56 | 1 234 567 | 9 950 000 | 19.0369
  const parseCurrencyAmount = (numStr) => {
    if (!numStr) return NaN;

    // Extract metric multiplier suffix (M, B, k, etc.)
    let multiplier = 1;
    const multiplierMatch = numStr.match(currencyMultiplierRegex);
    if (multiplierMatch) {
      multiplier = currencyMultiplierMap[multiplierMatch[1]] || 1;
      numStr = numStr.slice(0, -multiplierMatch[1].length);
    }

    // Normalize spaces to nothing (they're always thousands separators)
    numStr = numStr.replace(/\s/g, '');

    // Find last separator and digits after it
    const lastDot = numStr.lastIndexOf('.');
    const lastComma = numStr.lastIndexOf(',');
    const lastSep = Math.max(lastDot, lastComma);
    const digitsAfter = lastSep >= 0 ? numStr.length - lastSep - 1 : 0;
    const sepCount = (numStr.match(/[.,]/g) || []).length;

    // Decimal detection: single sep with ≠3 digits after, OR any sep with 2 digits after (cents)
    const isDecimal = lastSep >= 0 && (sepCount === 1 ? digitsAfter !== 3 : digitsAfter === 2);

    // Normalize to parseFloat format: remove thousands seps, convert decimal sep to dot
    if (isDecimal && lastComma > lastDot) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else if (!isDecimal || lastDot > lastComma) {
      numStr = numStr.replace(/,/g, '');
    }
    if (!isDecimal) numStr = numStr.replace(/\./g, '');

    return parseFloat(numStr) * multiplier;
  };

  // Resolve currency indicator (symbol, code, or configured composite indicator) to currency code
  const resolveCurrency = (indicator) => {
    const raw = indicator?.trim();
    if (!raw) return undefined;

    // Try configured composite indicators first (e.g. "AUD $")
    const aliasCode = indicatorAliasToCode[normalizeIndicator(raw)];
    if (aliasCode) return aliasCode;

    return symbolToCode[raw] || raw.toUpperCase();
  };

  // Transform currency
  const transformCurrency = async (text) => {
    const rates = await fetchRates();
    if (!rates) return text;

    // Combined pattern: any currency indicator (symbol or code)
    // - Symbols like "$", "€" can be attached to the number ("$500").
    // - Single-letter alphabetic symbols require whitespace ("R 500" not "R500").
    const currencyIndicatorPatternParts = [];

    // Configured composite indicators should match before plain symbols/codes
    if (indicatorAliasesPattern) {
      currencyIndicatorPatternParts.push(indicatorAliasesPattern);
    }
    if (nonSingleLetterAlphaSymbolsPattern) {
      currencyIndicatorPatternParts.push(nonSingleLetterAlphaSymbolsPattern);
    }
    currencyIndicatorPatternParts.push(codesPattern);
    if (singleLetterAlphaSymbolsPattern) {
      currencyIndicatorPatternParts.push(`(?:${singleLetterAlphaSymbolsPattern})(?=[\\s\\u00A0\\u202F])`);
    }
    const currencyIndicatorPattern = currencyIndicatorPatternParts.join('|');
    // Amount pattern: digits with optional separators (comma, dot, or spaces for thousands)
    // Note: thousands grouping in many locales uses NBSP (\u00A0) or NNBSP (\u202F), so allow those too.
    // Optional magnitude suffix comes from the unified currency config (k/M/B/T, bn/tn, etc.)
    const amountPattern = `[0-9][0-9,.\u00A0\u202F ]*[0-9](?:${currencyMultiplierPattern})?|[0-9](?:${currencyMultiplierPattern})?`;

    // Simple regex: (indicator)(amount) OR (amount)(indicator)
    // Notes:
    // - Require a non-word boundary before indicator to avoid matching inside words
    // - Require indicator not to be followed by a word char to avoid cases like "3.2 Reasoner"
    // Groups:
    // - indicator-first: 1=prefix, 2=indicator, 3=amount
    // - amount-first: 4=amount, 5=indicator
    const regex = new RegExp(
      `(^|[^\\w])(${currencyIndicatorPattern})\\s*(${amountPattern})|(${amountPattern})\\s*(${currencyIndicatorPattern})(?!\\w)`,
      'gi'
    );
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Skip if already converted (followed by " [")
      const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 2);
      if (afterMatch === ' [') continue;

      // Extract from either format: indicator-first or amount-first
      const numStr = match[3] || match[4];
      const indicator = match[2] || match[5];

      const currency = resolveCurrency(indicator);
      const amount = parseCurrencyAmount(numStr);

      if (currency && currency !== HOME_CURRENCY && !isNaN(amount)) {
        matches.push({ original: match[0], index: match.index, amount, currency });
      }
    }

    // Process in reverse to maintain indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const { original, index, amount, currency } = matches[i];
      const rate = rates[currency.toLowerCase()];

      if (rate) {
        const converted = amount / rate;
        const sym = getSymbol(HOME_CURRENCY);
        const formatted = converted.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        text = text.slice(0, index) + `${original} [${sym}${formatted}]` + text.slice(index + original.length);
      }
    }

    return text;
  };

  // Main transformation function (async - handles both currency and units)
  const transformText = async (text) => {
    // Early exit if text is too short or already has conversions
    if (!text || text.length < 2 || (text.includes('[') && text.includes(']'))) {
      return text;
    }

    // Apply currency conversion first
    text = await transformCurrency(text);

    // Collect all matches first, then apply replacements in reverse order
    const replacements = [];

    // Apply each unit conversion rule to the text
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

        // Collect replacement instead of applying immediately
        replacements.push({
          index: matchPosition,
          length: originalText.length,
          replacement
        });
      }
    });

    // Apply all replacements in reverse order to maintain indices
    replacements.sort((a, b) => b.index - a.index);
    for (const {index, length, replacement} of replacements) {
      text = text.slice(0, index) + replacement + text.slice(index + length);
    }

    return text;
  };

  // Cache the unit check regex for performance
  const unitPatterns = conversions.map(rule => rule.pattern).join('|');
  const unitRegex = new RegExp(`\\b(${unitPatterns})\\b`, 'i');

  // Check if text contains any unit keyword (without requiring numbers)
  const containsUnit = (text) => {
    return unitRegex.test(text);
  };

  // Find the appropriate parent element for context
  const findContextParent = (node) => {
    const containerTags = ['li', 'td', 'th', 'div', 'p', 'span'];
    let parent = node.parentElement;

    // Go up to 3 levels looking for a container element
    for (let i = 0; i < 3 && parent; i++) {
      const tag = parent.tagName?.toLowerCase();
      if (containerTags.includes(tag)) {
        return parent;
      }
      parent = parent.parentElement;
    }

    return node.parentElement; // Fallback to immediate parent
  };

  // Track processed nodes to avoid reprocessing
  const processedNodes = new WeakSet();
  const processedParents = new WeakSet();

  // Process a text node
  const processTextNode = async (node) => {
    // Skip if invalid or already processed
    if (!node || !node.nodeValue || processedNodes.has(node)) {
      return;
    }

    const text = node.nodeValue.trim();

    // Skip empty or very short text
    if (text.length < 2) {
      return;
    }

    // Mark as processed
    processedNodes.add(node);

    // If this node contains a unit, try parent context for HTML split patterns
    // BUT with strict performance limits
    if (containsUnit(text) && node.parentElement) {
      const contextParent = findContextParent(node);

      // Only try parent context if:
      // 1. We found a valid parent
      // 2. Parent hasn't been processed yet
      // 3. Parent text is reasonably sized (< 500 chars to prevent hangs)
      if (contextParent && !processedParents.has(contextParent)) {
        const parentText = contextParent.textContent;

        if (parentText.length < 500 && parentText.length > text.length) {
          processedParents.add(contextParent); // Mark BEFORE processing

          const transformedParent = await transformText(parentText);

          // Only proceed if a conversion was actually added
          if (parentText !== transformedParent) {
            // Extract NEW conversions (those not already in parent)
            const existingConversions = parentText.match(/\[[^\]]+\]/g) || [];
            const allConversions = transformedParent.match(/\[[^\]]+\]/g) || [];

            // Find conversions that are new
            const newConversions = allConversions.slice(existingConversions.length);

            if (newConversions.length > 0 && newConversions.length < 10) { // Max 10 conversions per parent
              // Insert new conversions after this text node
              for (const conversion of newConversions) {
                const conversionNode = document.createTextNode(` ${conversion}`);
                node.parentNode.insertBefore(conversionNode, node.nextSibling);
              }
              return;
            }
          }
        }
      }
    }

    // Normal text processing fallback
    const transformed = await transformText(node.nodeValue);
    if (transformed !== node.nodeValue) {
      node.nodeValue = transformed;
    }
  };

  // Elements to skip entirely
  const skipElements = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG']);

  // Walk through all DOM nodes recursively
  const walkDOM = async (node) => {
    // If it's a text node, process it
    if (node.nodeType === Node.TEXT_NODE) {
      await processTextNode(node);
    }
    // If it's an element, walk through its children
    else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip certain elements entirely
      if (skipElements.has(node.tagName)) {
        return;
      }

      let child = node.firstChild;
      while (child) {
        const nextSibling = child.nextSibling;
        await walkDOM(child);
        child = nextSibling;
      }
    }
    // If it's document or fragment, walk through children
    else if ([Node.DOCUMENT_NODE, Node.DOCUMENT_FRAGMENT_NODE].includes(node.nodeType)) {
      let child = node.firstChild;
      while (child) {
        const nextSibling = child.nextSibling;
        await walkDOM(child);
        child = nextSibling;
      }
    }
  };

  // Initialize the script when page is fully loaded
  if (typeof document !== "undefined") {
    // Fetch rates on load
    fetchRates();

    // Run initial conversions after page fully loads
    const runInitialConversions = () => {
      if (document.body) {
        // Wait 1 second after load for site JS to settle
        setTimeout(() => walkDOM(document.body), 1000);
      }
    };

    // Wait for page load
    if (document.readyState === 'complete') {
      runInitialConversions();
    } else {
      window.addEventListener('load', runInitialConversions);
    }

    // Debounce mutation processing
    let mutationTimeout = null;
    let pendingMutations = [];

    const processPendingMutations = () => {
      const batch = pendingMutations.splice(0, 50);

      batch.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType !== Node.COMMENT_NODE) {
              walkDOM(node);
            }
          });
        }
      });

      if (pendingMutations.length > 0) {
        setTimeout(processPendingMutations, 16);
      }
    };

    // Start observing after initial conversion
    setTimeout(() => {
      const observer = new MutationObserver((mutations) => {
        pendingMutations.push(...mutations);

        if (mutationTimeout) {
          clearTimeout(mutationTimeout);
        }

        mutationTimeout = setTimeout(() => {
          processPendingMutations();
          mutationTimeout = null;
        }, 300);
      });

      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    }, 2000); // Start observing 2s after script runs
  }

  // Export for testing
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { transformText, walkDOM };
  }
})();
