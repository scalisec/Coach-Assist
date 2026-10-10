// Division rules, from the BOMBA Rules (amended 2026), sections 3.2 and 6.4–6.9,
// plus decisions D2, D3, D5, D12 in the Decisions & Assumptions Log.
// Every rule the engine applies is read from here, so a rule change is a data edit.

export const INFIELD = ['C', 'P', '1B', '2B', '3B', 'SS'];
export const SIT = 'SIT';

// Outfield labels by number of outfielders (A3, D3, D12).
export const OUTFIELD_SETS = {
  4: ['LF', 'LCF', 'RCF', 'RF'],
  3: ['LF', 'CF', 'RF'],
  2: ['LF', 'RF'],
  1: ['CF'],
  0: [],
};
export const ALL_OUTFIELD = ['LF', 'LCF', 'CF', 'RCF', 'RF'];
export const isOutfield = (pos) => ALL_OUTFIELD.includes(pos);

const base = {
  rule43: true,          // 4.3 applies to 13U and below
  playerPitching: false, // true when players pitch (11U and up)
  pitchMax: null,        // max innings pitched per game
  catchMax: 2,           // max innings caught per game
  comboMax: null,        // max catch + pitch innings combined
  minCatchers: null,     // minimum different catchers per game
};

export const DIVISIONS = {
  '7U':  { ...base, code: '7U',  innings: 5, fielders: 10, outfielders: 4, minStart: 8 },
  '8U':  { ...base, code: '8U',  innings: 6, fielders: 10, outfielders: 4, minStart: 8 },
  '9U':  { ...base, code: '9U',  innings: 6, fielders: 10, outfielders: 4, minStart: 8 },
  '11U': { ...base, code: '11U', innings: 6, fielders: 10, outfielders: 4, minStart: 7,
           playerPitching: true, pitchMax: 2, catchMax: 3, comboMax: 3 },
  '13U': { ...base, code: '13U', innings: 7, fielders: 9, outfielders: 3, minStart: 7,
           playerPitching: true, pitchMax: 2, catchMax: 3, comboMax: 3 },
  // 15U/18U: rulebook says catch max 4, but catch + pitch combined is capped at 3,
  // so 3 is the real maximum (D5).
  '15U': { ...base, code: '15U', innings: 7, fielders: 9, outfielders: 3, minStart: 7, rule43: false,
           playerPitching: true, pitchMax: 3, catchMax: 3, comboMax: 3, minCatchers: 2 },
  '18U': { ...base, code: '18U', innings: 7, fielders: 9, outfielders: 3, minStart: 7, rule43: false,
           playerPitching: true, pitchMax: 3, catchMax: 3, comboMax: 3, minCatchers: 2 },
};

export const MAX_ROSTER = 15; // score sheet has 15 batting slots

export function getDivision(code) {
  const d = DIVISIONS[code];
  if (!d) throw new Error(`Unknown division "${code}". Use one of ${Object.keys(DIVISIONS).join(', ')}.`);
  return d;
}

// Field positions for an inning with `present` players on hand.
// Short-handed teams drop outfielders first (D3: one short -> 3 OF; D12: two short -> 2 OF).
export function fieldPositions(division, present) {
  const short = Math.max(0, division.fielders - present);
  const of = Math.max(0, division.outfielders - short);
  const infieldDrop = Math.max(0, short - division.outfielders);
  const infield = INFIELD.slice(0, INFIELD.length - infieldDrop);
  return [...infield, ...OUTFIELD_SETS[of]];
}
