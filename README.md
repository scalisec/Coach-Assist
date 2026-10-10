# CoachAssist

Fair-play lineup generator for BOMBA house-league volunteer coaches. Repository: scalisec/Coach-Assist.

## Status

Stage 2 of 6: **core screens** on top of the rules engine. Data is stored on the device only.

Screens: first run (set up a team or try a sample team), Home, Roster and player editor, Game setup (opponent dropdown, attendance, call-ups), Lineup (live fair-play check, Shuffle, 3 options, edit with swap/lock/undo, Fix for me, batting order, game-day changes), Player summary, Saved games, Settings.

**Score sheet PDF**: fills the official BOMBA form (assets/score_sheet.pdf) on the device with pdf-lib (src/vendor, MIT): header, batting order, jersey numbers, positions per inning with SIT for bench innings, H/V circled; substitute lines blank; non-compliant lineups are marked "Needs Convenor approval". Share, open to print, or save.

**Rosters**: import the BOMBA Roster Template (.xlsx) with a row-by-row check and fix screen; save a roster back into the template (ExcelJS, src/vendor, MIT). **Backup**: one .json file with every team, roster and saved lineup; restore from Settings or the first screen.

Not yet: league sign-in and updates (stage 4); install/offline (stage 5).

### Try it locally

```
python3 -m http.server 8080   # then open http://localhost:8080
```

| Part | File | What it does |
| --- | --- | --- |
| Division rules | `src/engine/divisions.js` | Innings, field size, outfielders, catching/pitching limits per division (BOMBA Rules 2026, 6.4–6.9) |
| Validator | `src/engine/validator.js` | Checks a lineup against rules 4.1–4.3, 4.6, catching, pitching, combined limits, field structure and batting order; plain-English messages with rule numbers |
| Generator | `src/engine/generator.js` | Builds many random lineups that obey the hard rules, scores them (variety, preferences, catcher pairs, balance) and returns the best; supports locks, mid-game changes, late arrivals, call-ups, options |
| Batting order | `src/engine/batting.js` | Season rotation: last game's bottom third bats first; newcomers after regulars; late arrivals last |

Rule interpretations follow the project's Decisions & Assumptions Log (D1–D25, A1–A17).

## Tests

```
npm test            # engine + app model; 60 seeds per division and roster size (~15 s)
npm run test:full   # 1,000 seeds: 60,000 generated lineups (~2 min)
npm run test:ui     # end-to-end in Chromium at phone size (needs `npm install` for Playwright)
```

Requires Node 18 or later. The app itself has no dependencies or build step.

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
