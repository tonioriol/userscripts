import { describe, it, expect } from 'vitest';
import { transformText } from './gometric.user.js';

describe('GoMetric', () => {
    // Data-driven test cases for unit conversions
    const testCases = [
        // Temperature
        { input: '32 F', expected: '[0 ℃]', category: 'Temperature' },
        { input: '212 F', expected: '[100 ℃]', category: 'Temperature' },
        
        // Distance
        { input: '1 inch', expected: '[2.54 cm]', category: 'Distance' },
        { input: '1 foot', expected: '[30.48 cm]', category: 'Distance' },
        { input: '1 yard', expected: '[91.44 cm]', category: 'Distance' },
        { input: '1 mile', expected: '[1.61 km]', category: 'Distance' },
        
        // Area
        { input: '1 acre', expected: '[4.05 km²]', category: 'Area' },
        { input: '100 sq ft', expected: '[9.29 m²]', category: 'Area' },
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
        { input: '30 mpg', expected: '[7.84 L/100km]', category: 'Fuel Economy' }
    ];

    describe('Unit conversions', () => {
        testCases.forEach(({ input, expected, category }) => {
            it(`converts ${input} correctly (${category})`, () => {
                expect(transformText(input)).toContain(expected);
            });
        });
    });

    describe('Fractional values', () => {
        it('converts fractions like 1/4', () => {
            expect(transformText('1/4 inch')).toContain('mm]');
        });

        it('converts mixed fractions like 1 1/4', () => {
            expect(transformText('1 1/4 inches')).toContain('[3.18 cm]');
        });
    });

    describe('Pattern matching', () => {
        it('matches multiple units in text', () => {
            const result = transformText('5 feet and 120 lbs');
            expect(result).toContain('[1.52 m]');
            expect(result).toContain('[54.43 kg]');
        });

        it('does not match already converted units', () => {
            const result = transformText('5 miles [8.05 km]');
            expect(result.match(/\[/g)).toHaveLength(1);
        });
    });

    describe('Idempotency', () => {
        it('does not convert already converted text', () => {
            const text = '5 miles';
            const firstPass = transformText(text);
            const secondPass = transformText(firstPass);
            expect(firstPass).toBe(secondPass);
        });
    });
});