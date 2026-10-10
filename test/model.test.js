import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleTeam, newGame, gamePlayers, generateFor, check, swapCell, toggleLock, midGameChange, previousBattingOrder, summaryRows, SIT,
} from '../src/app/model.js';

const setup = () => {
  const team = sampleTeam();
  const state = { version: 1, teams: [team], games: [], currentTeamId: team.id };
  const game = newGame(state, team);
  state.games.push(game);
  return { team, state, game };
};

test('sample team generates a compliant 8U lineup', () => {
  const { team, state, game } = setup();
  const r = generateFor(state, team, game, { seed: 1 });
  assert.equal(r.ok, true);
  game.lineup = r.lineup;
  assert.equal(check(team, game).ok, true);
  // Max can't catch
  const max = team.players.find((p) => p.first === 'Max');
  assert.ok(game.lineup.innings.every((row) => row[max.id] !== 'C'));
});

test('absent players and call-ups are handled', () => {
  const { team, state, game } = setup();
  game.attending = game.attending.slice(1);
  game.callUps = [{ id: 'c_1', first: 'Call', last: 'Up', jersey: '99', homeDivision: '7U' }];
  const players = gamePlayers(team, game);
  assert.equal(players.length, 12);
  assert.ok(players.find((p) => p.id === 'c_1').callUp);
  const r = generateFor(state, team, game, { seed: 2 });
  assert.equal(r.ok, true);
});

test('swapping a cell swaps with whoever held the spot; bench swaps name the sitter', () => {
  const { team, state, game } = setup();
  game.lineup = generateFor(state, team, game, { seed: 3 }).lineup;
  const row = game.lineup.innings[0];
  const a = Object.keys(row).find((id) => row[id] === 'SS');
  const b = Object.keys(row).find((id) => row[id] === '1B');
  const next = swapCell(game.lineup, 0, a, '1B');
  assert.equal(next.innings[0][a], '1B');
  assert.equal(next.innings[0][b], 'SS');
  const sitter = Object.keys(row).find((id) => row[id] === SIT);
  const benched = swapCell(game.lineup, 0, a, SIT, sitter);
  assert.equal(benched.innings[0][a], SIT);
  assert.equal(benched.innings[0][sitter], 'SS');
  assert.equal(game.lineup.innings[0][a], 'SS', 'original untouched');
});

test('locks survive a reshuffle', () => {
  const { team, state, game } = setup();
  game.lineup = generateFor(state, team, game, { seed: 4 }).lineup;
  const id = game.attending[0];
  const pos = game.lineup.innings[2][id];
  game.locks = toggleLock(game, 2, id);
  for (let s = 10; s < 20; s++) {
    const r = generateFor(state, team, game, { seed: s, keepBatting: true });
    assert.equal(r.ok, true);
    assert.equal(r.lineup.innings[2][id], pos);
  }
});

test('mid-game: leaving after inning 3 keeps innings 1-3 and stays compliant', () => {
  const { team, state, game } = setup();
  game.lineup = generateFor(state, team, game, { seed: 5 }).lineup;
  const leaver = game.attending[4];
  const r = midGameChange(state, team, game, { playerId: leaver, type: 'leave', inning: 3 });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.game.lineup.innings.slice(0, 3), game.lineup.innings.slice(0, 3));
  assert.ok(r.game.lineup.innings.slice(3).every((row) => row[leaver] == null));
  assert.equal(check(team, r.game).ok, true);
});

test('mid-game: a late arrival plays from their inning and bats last', () => {
  const { team, state, game } = setup();
  const late = game.attending[11];
  game.attending = game.attending.filter((x) => x !== late);
  game.lineup = generateFor(state, team, game, { seed: 6 }).lineup;
  const r = midGameChange(state, team, game, { playerId: late, type: 'arrive', inning: 3 });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.game.lineup.innings.slice(0, 2), game.lineup.innings.slice(0, 2));
  assert.equal(r.game.lineup.battingOrder.at(-1), late);
  assert.ok(r.game.lineup.innings[2][late]);
  assert.equal(check(team, r.game).ok, true);
});

test('next game rotates the batting order from the previous game', () => {
  const { team, state, game } = setup();
  game.lineup = generateFor(state, team, game, { seed: 7 }).lineup;
  game.date = '2026-05-01';
  const g2 = { ...newGame(state, team), date: '2026-05-08' };
  state.games.push(g2);
  assert.deepEqual(previousBattingOrder(state, g2), game.lineup.battingOrder);
  const r = generateFor(state, team, g2, { seed: 8 });
  const bottom = game.lineup.battingOrder.slice(-4).sort();
  assert.deepEqual(r.lineup.battingOrder.slice(0, 4).sort(), bottom);
  g2.lineup = r.lineup;
  const rows = summaryRows(team, g2, state);
  assert.equal(rows.length, 12);
  assert.ok(rows.every((x) => x.sits === 1 && x.of === 2));
});

test('backup round-trips and rejects other files', async () => {
  const { makeBackup, parseBackup } = await import('../src/app/backup.js');
  const { team, state, game } = setup();
  game.lineup = generateFor(state, team, game, { seed: 9 }).lineup;
  const r = parseBackup(makeBackup(state));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.teams, state.teams);
  assert.deepEqual(r.state.games, state.games);
  assert.match(r.summary, /1 team, 12 players, 1 saved lineups/);
  assert.equal(parseBackup('{"hello":1}').ok, false);
  assert.equal(parseBackup('not json').ok, false);
});

test('version numbers agree across app, version.json and package.json', async () => {
  const fs = await import('node:fs');
  const { APP_VERSION } = await import('../src/app/version.js');
  const vj = JSON.parse(fs.readFileSync(new URL('../version.json', import.meta.url)));
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(vj.version, APP_VERSION);
  assert.equal(pkg.version, APP_VERSION);
});

test('index.html loads every app file with the current version (npm run stamp)', async () => {
  const fs = await import('node:fs');
  const { APP_VERSION } = await import('../src/app/version.js');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap" id="versions">([\s\S]*?)<\/script>/)[1]);
  const versions = new Set(Object.values(map.imports).map((u) => u.split('?v=')[1]));
  assert.deepEqual([...versions], [APP_VERSION], 'run npm run stamp after bumping the version');
  assert.ok(html.includes(`src/app/main.js?v=${APP_VERSION}`));
  const listed = Object.keys(map.imports).length;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [e] : []));
  assert.equal(listed, walk(new URL('../src', import.meta.url).pathname).length, 'every app file is in the import map');
});
