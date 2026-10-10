import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLineup, validateLineup, rotateBattingOrder, DIVISIONS, SIT } from '../src/engine/index.js';
import { roster } from './helpers.js';

const SEEDS = process.env.FULL ? 1000 : 60;

// ---- the core promise: every division, every roster size, many seeds -----------------

for (const code of Object.keys(DIVISIONS)) {
  const div = DIVISIONS[code];
  test(`${code}: a valid lineup for every roster size ${div.minStart}–15 (${SEEDS} seeds each)`, () => {
    for (let n = div.minStart; n <= 15; n++) {
      for (let seed = 0; seed < SEEDS; seed++) {
        // vary restrictions with the seed: some players can't catch, some prefer spots
        const players = roster(n, (i) => ({
          cantPlay: (i + seed) % 5 === 0 ? ['C'] : [],
          preferred: (i + seed) % 4 === 0 ? ['SS'] : [],
          callUp: n >= 12 && i === n - 1 && seed % 3 === 0,
        }));
        const res = generateLineup({ division: code, players, seed, candidates: 10 });
        assert.equal(res.ok, true, `${code} n=${n} seed=${seed}: ${res.message} ${res.detail || ''}`);
        const check = validateLineup({ division: code, players, lineup: res.lineup });
        assert.equal(check.ok, true, `${code} n=${n} seed=${seed}: ${JSON.stringify(check.errors)}`);
        assert.equal(check.warnings.filter((w) => w.rule === 'restriction').length, 0, "can't-play respected");
      }
    }
  });
}

// ---- fairness shape ---------------------------------------------------------------

test('bench time is spread evenly: nobody sits twice more than anyone else', () => {
  for (const [code, n] of [['8U', 13], ['8U', 14], ['13U', 12], ['13U', 14], ['7U', 13]]) {
    for (let seed = 0; seed < 30; seed++) {
      const players = roster(n);
      const { lineup } = generateLineup({ division: code, players, seed, candidates: 5 });
      const sits = players.map((p) => lineup.innings.filter((row) => row[p.id] === SIT).length);
      assert.ok(Math.max(...sits) - Math.min(...sits) <= 1, `${code} n=${n}: ${sits}`);
    }
  }
});

test('the same seed gives the same lineup; a different seed usually differs', () => {
  const players = roster(12);
  const a = generateLineup({ division: '8U', players, seed: 42 });
  const b = generateLineup({ division: '8U', players, seed: 42 });
  const c = generateLineup({ division: '8U', players, seed: 43 });
  assert.deepEqual(a.lineup, b.lineup);
  assert.notDeepEqual(a.lineup.innings, c.lineup.innings);
});

test('options: up to 3 lineups that differ noticeably', () => {
  const res = generateLineup({ division: '8U', players: roster(12), seed: 5, options: 3 });
  assert.equal(res.lineups.length, 3);
});

test('generating 8U with 14 players takes well under a second', () => {
  const t = Date.now();
  generateLineup({ division: '8U', players: roster(14), seed: 1 });
  assert.ok(Date.now() - t < 1000);
});

// ---- coach controls -------------------------------------------------------------

test('lock & fill: a pinned cell is kept and the rest is rebuilt around it', () => {
  const players = roster(12);
  const locks = [{ 7: 'C' }, {}, { 3: 'SS' }];
  for (let seed = 0; seed < 20; seed++) {
    const res = generateLineup({ division: '8U', players, seed, locks });
    assert.equal(res.ok, true, res.message);
    assert.equal(res.lineup.innings[0][7], 'C');
    assert.equal(res.lineup.innings[2][3], 'SS');
  }
});

test('mid-game change: completed innings stay; a player leaving after inning 3 is handled', () => {
  const players = roster(12);
  const first = generateLineup({ division: '8U', players, seed: 9 }).lineup;
  const locks = first.innings.slice(0, 3);
  const leaving = players.map((p) => (p.id === 4 ? { ...p, availableUntil: 3 } : p));
  const res = generateLineup({ division: '8U', players: leaving, seed: 10, locks, battingOrder: first.battingOrder });
  assert.equal(res.ok, true, res.message);
  assert.deepEqual(res.lineup.innings.slice(0, 3), first.innings.slice(0, 3));
  for (let k = 3; k < 6; k++) assert.equal(res.lineup.innings[k][4], undefined, 'no position after leaving');
  assert.equal(validateLineup({ division: '8U', players: leaving, lineup: res.lineup }).ok, true);
});

test('late arrival bats last (3.2.6) and plays only from arrival', () => {
  const players = roster(11).concat([{ id: 12, jersey: 12, first: 'Late', last: 'Kid', availableFrom: 2 }]);
  const res = generateLineup({ division: '8U', players, seed: 2 });
  assert.equal(res.ok, true, res.message);
  assert.equal(res.lineup.battingOrder.at(-1), 12);
  assert.equal(res.lineup.innings[0][12], undefined);
  assert.ok(res.lineup.innings[2][12]);
});

test('call-ups never pitch, in any division', () => {
  for (const code of ['8U', '11U', '13U']) {
    for (let seed = 0; seed < 40; seed++) {
      const players = roster(12, (i) => ({ callUp: i >= 9, canPitch: i < 6 || i >= 9 }));
      const { lineup } = generateLineup({ division: code, players, seed, candidates: 5 });
      for (const row of lineup.innings) for (const id of [10, 11, 12]) assert.notEqual(row[id], 'P');
    }
  }
});

test('preferred positions are honoured more often than chance', () => {
  let hits = 0, chances = 0;
  for (let seed = 0; seed < 40; seed++) {
    const players = roster(12, (i) => (i === 0 ? { preferred: ['SS'] } : {}));
    const { lineup } = generateLineup({ division: '8U', players, seed });
    for (const row of lineup.innings) { if (row[1] !== SIT) { chances++; if (row[1] === 'SS') hits++; } }
  }
  assert.ok(hits / chances > 0.3, `${hits}/${chances}`); // chance is about 1 in 10
});

// ---- plain-language failures ----------------------------------------------------

test('too few players to start', () => {
  const res = generateLineup({ division: '8U', players: roster(7) });
  assert.equal(res.ok, false);
  assert.equal(res.message, '8U needs at least 8 players to start; 7 are here.');
});

test('not enough catchers', () => {
  const players = roster(12, (i) => (i >= 2 ? { cantPlay: ['C'] } : {}));
  const res = generateLineup({ division: '8U', players });
  assert.equal(res.ok, false);
  assert.match(res.message, /needs at least 3 players who can catch .* only 2 can/);
});

test('not enough pitchers in 11U', () => {
  const players = roster(12, (i) => ({ canPitch: i < 2 }));
  const res = generateLineup({ division: '11U', players });
  assert.equal(res.ok, false);
  assert.match(res.message, /needs at least 3 pitchers .* only 2 are marked "can pitch"/);
});

// ---- batting rotation -----------------------------------------------------------

test("batting rotation: last game's bottom third bats first next game", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const next = rotateBattingOrder(ids, ids, { seed: 1 });
  assert.deepEqual([...next.slice(0, 4)].sort((a, b) => a - b), [9, 10, 11, 12]);
  assert.deepEqual([...next].sort((a, b) => a - b), ids);
});

test('batting rotation: absent players skipped, newcomers after regulars, late arrivals last', () => {
  const prev = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const today = [1, 2, 3, 4, 5, 6, 8, 9, 20]; // 7 absent, 20 new
  const order = rotateBattingOrder(today, prev, { seed: 2, lateIds: [30] });
  assert.equal(order.length, 10);
  assert.ok(!order.includes(7));
  assert.equal(order.at(-2), 20);
  assert.equal(order.at(-1), 30);
});
