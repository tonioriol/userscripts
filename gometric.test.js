import { describe, it, expect, beforeEach } from 'vitest';
import { walkDOM } from './gometric.user.js';
import { JSDOM } from 'jsdom';

let dom, document;

beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
    global.document = document;
    global.Node = dom.window.Node;
});

describe('GoMetric', () => {
    const NBSP = '\u00A0';
    const NNBSP = '\u202F';

    // Helper to create element and get result
    const testConversion = async (html, expected) => {
        const div = document.createElement('div');
        div.innerHTML = html;
        await walkDOM(div);
        return div.textContent;
    };

    // Data-driven test cases
    const testCases = [
        // Temperature
        { input: '32 F', expected: '[0 ℃]', category: 'Temperature' },
        { input: '212 F', expected: '[100 ℃]', category: 'Temperature' },

        // Distance
        { input: '1 inch', expected: '[2.54 cm]', category: 'Distance' },
        { input: '1 foot', expected: '[30.48 cm]', category: 'Distance' },
        { input: '1 yard', expected: '[91.44 cm]', category: 'Distance' },
        { input: '1 mile', expected: '[1.61 km]', category: 'Distance' },
        { input: '1,000 feet', expected: '[304.8 m]', category: 'Distance (thousands)' },

        // Area
        { input: '1 acre', expected: '[4.05 km²]', category: 'Area' },
        { input: '100 sq ft', expected: '[9.29 m²]', category: 'Area' },
        { input: '100 sqft', expected: '[9.29 m²]', category: 'Area (no space)' },
        { input: '7,270 sqft', expected: '[675.4 m²]', category: 'Area (with comma)' },
        { input: '1 sq mi', expected: '[2.59 km²]', category: 'Area' },

        // Volume
        { input: '1 fl oz', expected: '[2.84 cL]', category: 'Volume' },
        { input: '1 pint', expected: '[56.83 cL]', category: 'Volume' },
        { input: '1 gallon', expected: '[4.55 L]', category: 'Volume' },

        // Cooking
        { input: '1 cup', expected: '[23.66 cL]', category: 'Cooking' },
        { input: '1 tbsp', expected: '[1.48 cL]', category: 'Cooking' },
        { input: '1 tsp', expected: '[4.93 mL]', category: 'Cooking' },

        // Weight
        { input: '1 oz', expected: '[28.35 g]', category: 'Weight' },
        { input: '1 lb', expected: '[453.59 g]', category: 'Weight' },
        { input: '10 lbs', expected: '[4.54 kg]', category: 'Weight' },
        { input: '10,000 lbs', expected: '[4.54 Mg]', category: 'Weight (thousands)' },

        // Speed
        { input: '60 mph', expected: '[96.56 km/h]', category: 'Speed' },
        { input: '10 knots', expected: '[18.52 km/h]', category: 'Speed' },
        { input: '100 fps', expected: '[30.48 m/s]', category: 'Speed' },

        // Pressure
        { input: '30 psi', expected: '[206.84 kPa]', category: 'Pressure' },
        { input: '1 bar', expected: '[100 kPa]', category: 'Pressure' },

        // Energy & Power
        { input: '1000 btu', expected: '[1.06 MJ]', category: 'Energy' },
        { input: '100 hp', expected: '[74.57 kW]', category: 'Power' },
        { input: '10 ft-lbs', expected: '[13.56 J]', category: 'Energy' },

        // Torque
        { input: '100 lb-ft', expected: '[135.58 N⋅m]', category: 'Torque' },

        // Fuel Economy
        { input: '30 mpg', expected: '[7.84 L/100km]', category: 'Fuel Economy' },

        // Fractions
        { input: '1/4 inch', expected: 'mm]', category: 'Fractions' },
        { input: '1 1/4 inches', expected: '[3.18 cm]', category: 'Mixed fractions' },

        // Complex patterns
        { input: '5 bds 5 ba 7,270 sqft', expected: '[675.4 m²]', category: 'Real estate listing' },

        // Currency (HOME_CURRENCY is EUR, formatted with locale separators)
        { input: '$3,489,000', expected: /\$3,489,000 \[€[\d.,]+\]/, category: 'Currency (USD millions)' },
        { input: '$1,234.56', expected: /\$1,234\.56 \[€[\d.,]+\]/, category: 'Currency (USD cents)' },
        { input: '$5000', expected: /\$5000 \[€[\d.,]+\]/, category: 'Currency (plain)' },
        { input: 'DKK 724,10', expected: /DKK 724,10 \[€[\d.,]+\]/, category: 'Currency (code before amount, European format)' },
        { input: '100 SEK', expected: /100 SEK \[€[\d.,]+\]/, category: 'Currency (code after amount)' },
        { input: '23.500M$,', expected: /23\.500M\$ \[€[\d.,]+\]/, category: 'Currency (M$ millions)' },
        { input: '84.000M$', expected: /84\.000M\$ \[€[\d.,]+\]/, category: 'Currency (USD millions with dots)' },
        { input: '323.000M SEK', expected: /323\.000M SEK \[€[\d.,]+\]/, category: 'Currency (SEK millions with dots)' },
        { input: '$500M', expected: /\$500M \[€[\d.,]+\]/, category: 'Currency (USD M suffix)' },
        { input: '1.5B USD', expected: /1\.5B USD \[€[\d.,]+\]/, category: 'Currency (USD billions)' },
        { input: 'R 9 950 000', expected: /R 9 950 000 \[€[\d.,]+\]/, category: 'Currency (ZAR with space separators)' },
        { input: 'R 12 345,67', expected: /R 12 345,67 \[€[\d.,]+\]/, category: 'Currency (ZAR space thousands + comma decimals)' },
        { input: `R 1${NBSP}234${NBSP}567,89`, expected: /R 1\u00A0234\u00A0567,89 \[€[\d.,]+\]/, category: 'Currency (ZAR NBSP thousands + comma decimals)' },
        { input: `R 1${NNBSP}234${NNBSP}567,89`, expected: /R 1\u202F234\u202F567,89 \[€[\d.,]+\]/, category: 'Currency (ZAR NNBSP thousands + comma decimals)' },
        { input: '19.0369 ZAR', expected: /19\.0369 ZAR \[€[\d.,]+\]/, category: 'Currency (ZAR decimal rate)' },
        { input: '12.34 USD', expected: /12\.34 USD \[€[\d.,]+\]/, category: 'Currency (USD decimal dot)' },
        { input: '12,34 USD', expected: /12,34 USD \[€[\d.,]+\]/, category: 'Currency (USD decimal comma)' },
        { input: '12.345 USD', expected: /12\.345 USD \[€[\d.,]+\]/, category: 'Currency (USD ambiguous dot: treat as thousands)' },
        { input: '12,345 USD', expected: /12,345 USD \[€[\d.,]+\]/, category: 'Currency (USD ambiguous comma: treat as thousands)' },

        // Potential false positives / ambiguity checks
        // ZAR symbol "R" is highly ambiguous, so we only match it when separated from the amount by whitespace.
        { input: 'R50', expected: '[€', negative: true, category: 'Currency (ZAR without space should NOT match)' },
        { input: 'R 50', expected: /R 50 \[€[\d.,]+\]/, category: 'Currency (ZAR with space should match)' },
        { input: `R${NBSP}50`, expected: /R\u00A050 \[€[\d.,]+\]/, category: 'Currency (ZAR with NBSP should match)' },
        { input: `R${NNBSP}50`, expected: /R\u202F50 \[€[\d.,]+\]/, category: 'Currency (ZAR with NNBSP should match)' },

        // Train line identifiers (common false positive for ZAR): should not match (no space)
        { input: 'Train lines R1, R2, R3 are delayed', expected: '[€', negative: true, category: 'Train lines (R1, R2, R3)' },
        { input: 'Take the R11 to the airport', expected: '[€', negative: true, category: 'Train line R11' },
        { input: 'Lines R1, R2 Nord, R2 Sud, R3, R4, R7, R8 i R11', expected: '[€', negative: true, category: 'Multiple train lines' },

        { input: 'Version 3.2 Reasoner', expected: '[€', negative: true, category: 'Version number with R word' },
        { input: 'iPhone 15 Pro Max', expected: '[€', negative: true, category: 'Product name with number' },

        // HTML split patterns
        { input: '<b>1,370</b> <abbr>sqft</abbr>', expected: '[127.28 m²]', category: 'HTML (number and unit split)' },
        { input: '<b>6.87</b> acres lot', expected: '[27.8 km²]', category: 'HTML (acres split)' },
        { input: '<b>1,370 sqft</b>', expected: '[127.28 m²]', category: 'HTML (same element)' },

        // Edge cases
        { input: '5 feet and 120 lbs', expected: '[1.52 m]', category: 'Multiple units' },
        { input: '$750,000 with 1,370 sqft', expected: '[€', category: 'Currency and area' },
    ];

    describe('All conversions via walkDOM', () => {
        testCases.forEach(({ input, expected, negative, category }) => {
            const testName = negative
                ? `does NOT convert: ${input} (${category})`
                : `converts ${input} correctly (${category})`;

            it(testName, async () => {
                const result = await testConversion(input, expected);
                if (negative) {
                    expect(result).not.toContain(expected);
                } else if (expected instanceof RegExp) {
                    expect(result).toMatch(expected);
                } else {
                    expect(result).toContain(expected);
                }
            });
        });
    });

    describe('Re-conversion prevention', () => {
        it('does not re-convert already converted units', async () => {
            const result = await testConversion('5 miles [8.05 km]');
            expect(result.match(/\[/g)).toHaveLength(1);
        });

        it('does not convert already converted currency', async () => {
            const result = await testConversion('$100 [€85]');
            expect(result.match(/\[/g)).toHaveLength(1);
        });

        it('does not reprocess same nodes twice', async () => {
            const div = document.createElement('div');
            div.innerHTML = '10 miles';

            await walkDOM(div);
            const firstResult = div.textContent;

            await walkDOM(div);
            const secondResult = div.textContent;

            expect(secondResult).toBe(firstResult);
            expect(firstResult.match(/\[/g)).toHaveLength(1);
        });
    });

    describe('Performance optimizations', () => {
        it('skips empty or very short text nodes', async () => {
            const div = document.createElement('div');
            div.innerHTML = '<span> </span><span>a</span><span>  </span>';
            await walkDOM(div);
            // Should complete without errors and not process these nodes
            expect(div.textContent).toBe(' a  ');
        });

        it('skips already converted text (early exit)', async () => {
            const startTime = Date.now();
            const result = await testConversion('Already converted: 5 miles [8.05 km] and 10 lbs [4.54 kg]');
            const duration = Date.now() - startTime;

            // Should not add more conversions
            expect(result.match(/\[/g)).toHaveLength(2);
            // Should be fast (early exit prevents expensive regex processing)
            expect(duration).toBeLessThan(100);
        });

        it('does not reprocess the same nodes', async () => {
            const div = document.createElement('div');
            div.innerHTML = '10 miles to go';

            // First pass
            await walkDOM(div);
            const firstResult = div.textContent;
            expect(firstResult).toContain('[16.09 km]');

            // Second pass - should not double-convert
            await walkDOM(div);
            const secondResult = div.textContent;
            expect(secondResult).toBe(firstResult);
            expect(secondResult.match(/\[/g)).toHaveLength(1);
        });

        it('skips script and style elements', async () => {
            const div = document.createElement('div');
            div.innerHTML = `
                <script>var distance = "10 miles";</script>
                <style>.width { max-width: 100 inches; }</style>
                <div>10 miles</div>
            `;
            await walkDOM(div);

            // Script and style content should not be converted
            const scriptContent = div.querySelector('script').textContent;
            const styleContent = div.querySelector('style').textContent;
            expect(scriptContent).toBe('var distance = "10 miles";');
            expect(styleContent).toBe('.width { max-width: 100 inches; }');

            // Only the div content should be converted
            const divContent = div.querySelector('div').textContent;
            expect(divContent).toContain('[16.09 km]');
        });

        it('handles multiple replacements efficiently', async () => {
            const startTime = Date.now();
            const text = Array(20).fill('5 miles, 10 lbs, 100 F').join(' and ');
            const result = await testConversion(text);
            const duration = Date.now() - startTime;

            // Should convert all instances
            expect(result.match(/\[.*?km\]/g)).toHaveLength(20);
            expect(result.match(/\[.*?kg\]/g)).toHaveLength(20);
            expect(result.match(/\[.*?℃\]/g)).toHaveLength(20);

            // Should complete in reasonable time (batch processing)
            expect(duration).toBeLessThan(1000);
        });

        it('handles nested elements efficiently', async () => {
            const div = document.createElement('div');
            div.innerHTML = `
                <div>
                    <p>Distance: <span>5 miles</span></p>
                    <p>Weight: <b>10 lbs</b></p>
                    <ul>
                        <li>Item 1: 100 F</li>
                        <li>Item 2: 50 mph</li>
                    </ul>
                </div>
            `;

            const startTime = Date.now();
            await walkDOM(div);
            const duration = Date.now() - startTime;

            // Should convert all nested values
            expect(div.textContent).toContain('[8.05 km]');
            expect(div.textContent).toContain('[4.54 kg]');
            expect(div.textContent).toContain('[37.78 ℃]');
            expect(div.textContent).toContain('[80.47 km/h]');

            // Should complete quickly
            expect(duration).toBeLessThan(200);
        });

        it('handles very long text efficiently', async () => {
            const longText = 'This is a story about traveling. '.repeat(100) + 'I drove 50 miles';
            const startTime = Date.now();
            const result = await testConversion(longText);
            const duration = Date.now() - startTime;

            expect(result).toContain('[80.47 km]');
            // Early exit should help with long text that has no units
            expect(duration).toBeLessThan(500);
        });
    });
});
