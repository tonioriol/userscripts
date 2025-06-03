// Script to extract comprehensive language codes from ISO 639 dataset
// Usage: node extract-language-codes.js > langcodes.txt

import data from './iso-language-codes-639-1-and-639-2@public.json' assert { type: 'json' };
const codes = new Set();

data.forEach(lang => {
  // Add 2-letter codes (most important)
  if (lang.alpha2) codes.add(lang.alpha2);
  
  // Add 3-letter codes
  if (lang.alpha3_b) codes.add(lang.alpha3_b);
  if (lang.alpha3_t) codes.add(lang.alpha3_t);
  
  // Add English names (lowercase, simple words only)
  lang.english.forEach(name => {
    const simple = name.toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove special chars
      .split(/\s+/) // Split on whitespace
      .filter(word => word.length >= 2 && word.length <= 15); // Reasonable length
    simple.forEach(word => codes.add(word));
  });
});

// Convert to sorted array
const langCodes = Array.from(codes).sort();

console.log('// Comprehensive language codes extracted from ISO 639-1 and 639-2');
console.log('// Total codes:', langCodes.length);
console.log('const langCodes = [');
console.log('  ' + langCodes.map(c => `'${c}'`).join(',\n  '));
console.log('];');

console.log('\n// Single unified replacement pattern:');
console.log('const replacements = [');
console.log('  [new RegExp(`\\\\b(${langCodes.join(\'|\')})\\\\b`, \'gi\'), targetLangConfig.code]');
console.log('];');