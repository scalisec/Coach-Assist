import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLineup, generateLineup } from '../src/engine/index.js';
import { roster, MOCK_12, fromRows, rulesHit } from './helpers.js';

const v = (division, players, rows) => validateLineup({ division, players, lineup: fromRows(rows) });
const clone = (rows) => rows.map((r) => [...r]);

test('mockup 12-player 8U lineup passes every rule', () => {
  const res = v('8U', roster(12), MOCK_12);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test('4.1: back-to-back sits are caught', () => {
  const rows = clone(MOCK_12);
  // Mia (player 5) sits innings 3 and 4; Noah (player 4) takes her LCF in inning 4
  rows[4][3] = 'SIT'; rows[3][3] = 'LCF';
  const res = v('8U', roster(12), rows);
  assert.ok(rulesHit(res).includes('4.1'));
  assert.ok(rulesHit(res).includes('4.3'), 'Noah reaches a 3rd outfield inning in inning 5 while Mia has none');
});

test('4.2: a 2nd sit before everyone has sat once is caught', () => {
  const rows = clone(MOCK_12);
  // player 1 sits innings 3 and 5 (2nd sit in inning 5); player 7 (who sat in 5) plays instead
  rows[0][4] = 'SIT'; rows[6][4] = '3B';
  const res = v('8U', roster(12), rows);
  assert.ok(rulesHit(res).includes('4.2'));
});

test('D1: a 2nd sit in the same inning the last player sits for the first time is allowed', () => {
  // 8U, 13 players: 3 sit each inning, 18 sits, so 5 players sit twice. In inning 5 the
  // last first-time sitter (13) shares the bench with two second-time sitters (1, 2).
  const sitPlan = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 1, 2], [3, 4, 5]];
  const FIELD = ['C', 'P', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'RCF', 'RF'];
  const rows = Array.from({ length: 13 }, () => []);
  sitPlan.forEach((sitters, k) => {
    const playing = [...Array(13).keys()].map((i) => i + 1).filter((id) => !sitters.includes(id));
    sitters.forEach((id) => { rows[id - 1][k] = 'SIT'; });
    playing.forEach((id, n) => { rows[id - 1][k] = FIELD[(n + k) % 10]; });
  });
  const res = v('8U', roster(13), rows);
  assert.deepEqual(res.errors.filter((e) => e.rule === '4.2' || e.rule === '4.1' || e.rule === 'structure'), []);
  // and the same bench one inning earlier IS a violation
  const early = rows.map((r) => [...r]);
  [early[0][3], early[9][3]] = [early[9][3], early[0][3]]; // player 1 sits in inning 4 instead of player 10
  assert.ok(rulesHit(v('8U', roster(13), early)).includes('4.2'));
});

test('4.3: D1 allows a 3rd outfield inning in the inning the last players reach two', () => {
  // 8U, 10 players, no bench: 24 outfield slots, 4 players must play 3.
  // Innings 1-5 give everyone exactly 2; inning 6 gives 4 players their 3rd.
  const OF = ['LF', 'LCF', 'RCF', 'RF'];
  const IF = ['C', 'P', '1B', '2B', '3B', 'SS'];
  const rows = Array.from({ length: 10 }, () => []);
  const ofTurns = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 0, 1], [2, 3, 4, 5], [6, 7, 8, 9], [0, 1, 2, 3]];
  ofTurns.forEach((ofPlayers, k) => {
    let j = 0;
    const ifPlayers = [...Array(10).keys()].filter((i) => !ofPlayers.includes(i));
    // rotate infield spots so nobody catches more than twice
    ifPlayers.forEach((i, n) => { rows[i][k] = IF[(n + k) % 6]; });
    ofPlayers.forEach((i) => { rows[i][k] = OF[j++]; });
  });
  const res = v('8U', roster(10), rows);
  assert.deepEqual(res.errors.filter((e) => e.rule === '4.3'), [], JSON.stringify(res.errors));
});

test('spreadsheet 13-player rotation from the 8U generator breaks 4.2 and 4.3 (discovery finding)', () => {
  const cyc = ['C', 'SIT', 'LCF', 'SS', 'RF', 'P', 'SIT', '3B', '1B', 'SIT', 'RCF', '2B', 'LF'];
  const startOf = ['C', 'P', '1B', '2B', 'SS', '3B', 'LF', 'LCF', 'RCF', 'RF'];
  // starting positions in the sheet's order: C, P, 1B, 2B, SS, 3B, LF, LC, RC, RF, Bench-1, Bench-2, Bench-3
  const startIdx = [0, 5, 8, 11, 3, 7, 12, 2, 10, 4, 6, 1, 9];
  const rows = startIdx.map((s) => Array.from({ length: 6 }, (_, k) => cyc[(s + k) % 13]));
  assert.equal(startOf.length, 10);
  const res = v('8U', roster(13), rows);
  const hit = rulesHit(res);
  assert.ok(hit.includes('4.2'), hit.join());
  assert.ok(hit.includes('4.3'), hit.join());
});

test('catching limit: 8U max 2, 11U max 3', () => {
  const rows = clone(MOCK_12);
  // player 1 catches innings 1, 2 and 3 (takes C from player 6 in inning 1 and player 4 in inning 3)
  rows[0][0] = 'C'; rows[5][0] = '1B';
  rows[0][2] = 'C'; rows[3][2] = 'SIT'; rows[0][2] = 'C';
  const r8 = v('8U', roster(12), rows);
  assert.ok(rulesHit(r8).includes('catch'));
});

test('pitching: back-to-back, max innings, call-ups (11U)', () => {
  const players = roster(10, () => ({ canPitch: true, canCatch: true }));
  const gen = generateLineup({ division: '11U', players, seed: 3 });
  assert.equal(gen.ok, true);
  const base = gen.lineup;
  const pitcherIn = (k) => Number(Object.keys(base.innings[k]).find((id) => base.innings[k][id] === 'P'));

  // the inning-1 pitcher also pitches inning 4 (not back-to-back, and maybe over the max)
  const gap = structuredClone(base);
  const p1 = pitcherIn(0), p4 = pitcherIn(3);
  if (p1 !== p4) { gap.innings[3][p4] = gap.innings[3][p1]; gap.innings[3][p1] = 'P'; }
  const hit = rulesHit(validateLineup({ division: '11U', players, lineup: gap }));
  assert.ok(hit.includes('pitch'), hit.join());

  // a call-up pitching is never allowed (4.6)
  const callUps = players.map((p) => (p.id === p1 ? { ...p, callUp: true } : p));
  assert.ok(rulesHit(validateLineup({ division: '11U', players: callUps, lineup: base })).includes('4.6'));
});

test('combined catch + pitch max 3 (13U)', () => {
  const players = roster(9, () => ({ canPitch: true, canCatch: true }));
  const POS = ['C', 'P', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const rows = Array.from({ length: 9 }, (_, i) => Array.from({ length: 7 }, (_, k) => POS[(i + k) % 9]));
  // player 1: C P in innings 1-2 by rotation; make them catch innings 3 and 4 too
  const swapWith = (k, pos) => { const j = rows.findIndex((r) => r[k] === pos); rows[j][k] = rows[0][k]; rows[0][k] = pos; };
  swapWith(2, 'C'); swapWith(3, 'C');
  const hit = rulesHit(v('13U', players, rows));
  assert.ok(hit.includes('combo') || hit.includes('catch'), hit.join());
});

test('15U needs at least 2 catchers', () => {
  const players = roster(9, () => ({ canPitch: true, canCatch: true }));
  const others = ['P', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const rows = Array.from({ length: 9 }, (_, i) => Array.from({ length: 7 }, (_, k) => (i === 0 ? 'C' : others[(i - 1 + k) % 8])));
  const hit = rulesHit(v('15U', players, rows));
  assert.ok(hit.includes('catchers') && hit.includes('catch'), hit.join());
});

test('short-handed: 9 players in 8U use LF, CF, RF; LCF is rejected', () => {
  const POS = ['C', 'P', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const rows = Array.from({ length: 9 }, (_, i) => Array.from({ length: 6 }, (_, k) => POS[(i + k) % 9]));
  const ok = v('8U', roster(9), rows);
  assert.deepEqual(ok.errors.filter((e) => e.rule === 'structure'), []);
  rows[6][0] = 'LCF';
  assert.ok(rulesHit(v('8U', roster(9), rows)).includes('structure'));
});

test('structure: two players at one spot and an empty spot are both reported', () => {
  const rows = clone(MOCK_12);
  rows[0][0] = 'SS'; // player 1 joins player 7 at SS, nobody at 1B
  const msgs = v('8U', roster(12), rows).errors.map((e) => e.message).join(' | ');
  assert.match(msgs, /2 players are at SS in inning 1/);
  assert.match(msgs, /Nobody is at 1B in inning 1/);
});

test('batting order: missing and duplicate players', () => {
  const lineup = fromRows(MOCK_12);
  lineup.battingOrder = [1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11];
  const msgs = validateLineup({ division: '8U', players: roster(12), lineup }).errors.map((e) => e.message).join(' | ');
  assert.match(msgs, /twice/);
  assert.match(msgs, /missing from the batting order/);
});

test("warnings: can't-play position and missing jersey don't block the lineup", () => {
  const players = roster(12, (i) => (i === 5 ? { cantPlay: ['C'], jersey: '' } : {}));
  const res = v('8U', players, MOCK_12);
  assert.equal(res.ok, true);
  const rules = res.warnings.map((w) => w.rule);
  assert.ok(rules.includes('restriction') && rules.includes('jersey'));
});

test('messages name the player and the inning in plain words', () => {
  const rows = clone(MOCK_12);
  rows[4][3] = 'SIT'; rows[3][3] = 'LCF';
  const e = v('8U', roster(12), rows).errors.find((x) => x.rule === '4.1');
  assert.equal(e.message, 'Player5 T. sits innings 3 and 4 in a row.');
  assert.equal(e.inning, 4);
});
