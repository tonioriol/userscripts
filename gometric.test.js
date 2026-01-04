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
        
        // HTML split patterns
        { input: '<b>1,370</b> <abbr>sqft</abbr>', expected: '[127.28 m²]', category: 'HTML (number and unit split)' },
        { input: '$750,000 <b>3</b> bds <b>2</b> ba <b>1,370</b> <abbr>sqft</abbr>', expected: '[127.28 m²]', category: 'HTML (real estate)' },
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
});
