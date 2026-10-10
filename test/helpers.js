// Test helpers: rosters and a known-good lineup.

export function roster(n, extra = () => ({})) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, jersey: i + 1, first: `Player${i + 1}`, last: 'Test',
    canPitch: i < 6, canCatch: i % 2 === 0, ...extra(i),
  }));
}

// The 12-player 8U lineup shown in the mockups (checked by hand against 4.1–4.3).
export const MOCK_12 = [
  ['1B', 'C', 'SIT', 'LF', '3B', 'RCF'], ['LF', '3B', 'RCF', '2B', 'P', 'SIT'],
  ['LCF', 'SS', 'RF', '1B', 'C', 'SIT'], ['RF', '1B', 'C', 'SIT', 'LF', '3B'],
  ['2B', 'P', 'SIT', 'LCF', 'SS', 'RF'], ['C', 'SIT', 'LF', '3B', 'RCF', '2B'],
  ['SS', 'RF', '1B', 'C', 'SIT', 'LF'], ['SIT', 'LCF', 'SS', 'RF', '1B', 'P'],
  ['P', 'SIT', 'LCF', 'SS', 'RF', '1B'], ['SIT', 'LF', '3B', 'RCF', '2B', 'C'],
  ['RCF', '2B', 'P', 'SIT', 'LCF', 'SS'], ['3B', 'RCF', '2B', 'P', 'SIT', 'LCF'],
];

// rows: one array of positions per player (player i+1), turned into innings objects
export function fromRows(rows) {
  const innings = rows[0].map(() => ({}));
  rows.forEach((r, i) => r.forEach((pos, k) => { if (pos != null) innings[k][i + 1] = pos; }));
  return { battingOrder: rows.map((_, i) => i + 1), innings };
}

export const rulesHit = (res) => [...new Set(res.errors.map((e) => e.rule))].sort();
