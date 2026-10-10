# BOMBA Lineup Helper

Fair-play lineup generator for BOMBA house-league volunteer coaches.

## Status

Stage 1 of 6: **rules engine** (no screens yet).

| Part | File | What it does |
| --- | --- | --- |
| Division rules | `src/engine/divisions.js` | Innings, field size, outfielders, catching/pitching limits per division (BOMBA Rules 2026, 6.4–6.9) |
| Validator | `src/engine/validator.js` | Checks a lineup against rules 4.1–4.3, 4.6, catching, pitching, combined limits, field structure and batting order; plain-English messages with rule numbers |
| Generator | `src/engine/generator.js` | Builds many random lineups that obey the hard rules, scores them (variety, preferences, catcher pairs, balance) and returns the best; supports locks, mid-game changes, late arrivals, call-ups, options |
| Batting order | `src/engine/batting.js` | Season rotation: last game's bottom third bats first; newcomers after regulars; late arrivals last |

Rule interpretations follow the project's Decisions & Assumptions Log (D1–D25, A1–A17).

## Tests

```
npm test            # 60 seeds per division and roster size (~10 s)
npm run test:full   # 1,000 seeds: 60,000 generated lineups (~2 min)
```

Requires Node 18 or later. No dependencies.

## Use

```js
import { generateLineup, validateLineup } from './src/engine/index.js';

const res = generateLineup({ division: '8U', players, previousBattingOrder });
if (res.ok) {
  const check = validateLineup({ division: '8U', players, lineup: res.lineup });
}
```

A player is `{ id, jersey, first, last, cantPlay: [], preferred: [], canPitch, canCatch, callUp, availableFrom, availableUntil }`.
A lineup is `{ battingOrder: [id], innings: [{ [id]: 'C' | 'P' | '1B' | … | 'SIT' }] }`.
