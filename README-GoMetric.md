# GoMetric

Automatically converts imperial units to metric units and currencies on web pages.

## Features

- Converts temperature (F / °F to °C), including ranges like `50-70°F`
- Converts distance (miles, feet, inches to km, m, cm)
- Converts weight (lbs, oz to kg, g)
- Converts speed (mph to km/h)
- Converts currencies between different formats, including ranges like `$4,000-7,000`
- Non-intrusive inline conversion display

## How It Works

Scans text content and adds metric conversions in brackets:

```
The car goes 60 mph → The car goes 60 mph [96.56 km/h]
Temperature is 75 F → Temperature is 75 F [23.89 °C]
Weighs 150 lbs → Weighs 150 lbs [68.04 kg]
Temps in the 50-70°F range → Temps in the 50-70°F range [10-21.11 ℃]
Budget $4,000-7,000/person → Budget $4,000-7,000 [€3,367.38-€5,892.92]/person
```

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install GoMetric
3. Browse any website with imperial units

## License

AGPL-3.0-or-later License
