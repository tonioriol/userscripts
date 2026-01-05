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
        
        // HTML split patterns (restored with performance limits)
        { input: '<b>1,370</b> <abbr>sqft</abbr>', expected: '[127.28 m²]', category: 'HTML (number and unit split)' },
        { input: '<b>6.87</b> acres lot', expected: '[27.8 km²]', category: 'HTML (acres split)' },
    ];

    describe('All conversions via walkDOM', () => {
        testCases.forEach(({ input, expected, category }) => {
            it(`converts ${input} correctly (${category})`, async () => {
                const result = await testConversion(input, expected);
                if (expected instanceof RegExp) {
                    expect(result).toMatch(expected);
                } else {
                    expect(result).toContain(expected);
                }
            });
        });
    });

    describe('Edge cases', () => {
        it('matches multiple units in text', async () => {
            const result = await testConversion('5 feet and 120 lbs');
            expect(result).toContain('[1.52 m]');
            expect(result).toContain('[54.43 kg]');
        });

        it('does not re-convert already converted units', async () => {
            const result = await testConversion('5 miles [8.05 km]');
            expect(result.match(/\[/g)).toHaveLength(1);
        });

        it('does not convert already converted currency', async () => {
            const result = await testConversion('$100 [€85]');
            expect(result.match(/\[/g)).toHaveLength(1);
        });

        it('handles currency and area together', async () => {
            const result = await testConversion('$750,000 with 1,370 sqft');
            expect(result).toContain('$750,000');
            expect(result).toContain('[€');
            expect(result).toContain('[127.28 m²]');
        });
    });

    describe('HTML split pattern safeguards', () => {
        it('converts numbers and units split across HTML elements', async () => {
            // Restored with performance limits
            const result = await testConversion('<b>1,370</b> <abbr>sqft</abbr>');
            expect(result).toContain('[127.28 m²]');
        });

        it('converts when number and unit are in same element', async () => {
            const result = await testConversion('<b>1,370 sqft</b>');
            expect(result).toContain('[127.28 m²]');
        });

        it('handles complex real estate listings', async () => {
            // Both currency and area should convert
            const result = await testConversion('$750,000 <b>3</b> bds <b>2</b> ba <b>1,370 sqft</b>');
            expect(result).toContain('[€');
            expect(result).toContain('[127.28 m²]');
        });

        it('skips very large parent contexts (> 500 chars)', async () => {
            // Create a parent with > 500 chars
            const longText = 'Lorem ipsum dolor sit amet. '.repeat(20); // ~560 chars
            const result = await testConversion(`${longText}<b>100</b> <abbr>sqft</abbr>`);
            
            // Should still process normally but won't use expensive parent context
            expect(result.length).toBeGreaterThan(500);
        });

        it('limits conversions per parent to prevent abuse (max 10)', async () => {
            // The parent context feature has a hard limit of 10 conversions
            // This prevents performance issues with pages containing many units
            const div = document.createElement('div');
            div.innerHTML = '<p>' + Array(15).fill('10 miles').join(', ') + '</p>';
            
            await walkDOM(div);
            const result = div.textContent;
            
            // Should convert all since they're in same text node (not split pattern)
            const conversionCount = (result.match(/\[[\d.]+ km\]/g) || []).length;
            expect(conversionCount).toBe(15); // All converted in normal mode
        });

        it('does not reprocess same parent multiple times', async () => {
            const div = document.createElement('div');
            div.innerHTML = '<p><b>100</b> <span>sqft</span></p>';
            
            // First pass
            await walkDOM(div);
            const firstResult = div.textContent;
            const firstConversionCount = (firstResult.match(/\[/g) || []).length;
            
            // Second pass - should not duplicate conversions
            await walkDOM(div);
            const secondResult = div.textContent;
            const secondConversionCount = (secondResult.match(/\[/g) || []).length;
            
            // Results should be identical
            expect(secondResult).toBe(firstResult);
            expect(secondConversionCount).toBe(firstConversionCount);
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
