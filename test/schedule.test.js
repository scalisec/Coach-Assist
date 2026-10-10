import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseScheduleRows, parseScheduleWorkbook, parseDate, parseTime, formatTime, matchTeam, teamSchedule, applySchedule } from '../src/app/schedule.js';
import { sampleTeam, upcomingGames, resetLineup, deleteGame, newGame, syncAttendance, generateFor } from '../src/app/model.js';

// Same layout as the league's 2026 9U schedule export (Date, Day, Start time, End Time, Home team,
// Visitor team, Venue, Event, Week), with a few rows of each kind.
const HEAD = ['Date', 'Day', 'Start time', 'End Time', 'Home team', 'Visitor team', 'Venue', 'Event', 'Week'];
const ROWS = [
  ['05/12/2026', 'Tuesday', '6:15pm', '8:30pm', 'Dodgers', 'Blue Jays', 'Fothergill Woods', 'Game', ''],
  ['05/12/2026', 'Tuesday', '6:15pm', '8:30pm', 'Expos', 'Yankees', 'Kerns Park 2', 'Game', 1],
  ['05/14/2026', 'Thursday', '6:15pm', '8:30pm', 'Rockies', 'Expos', 'Kerns Park 1', 'Game', ''],
  [],
  ['06/2/2026', 'Tuesday', '6:15pm', '8:30pm', 'Athletics', 'Expos', 'Thorpe Park', 'Game', 4],
  ['07/28/2026', 'Tuesday', '6:15pm', '8:30pm', '1st', '10th', 'Fothergill Woods', 'Game 1', ''],
  ['08/6/2026', 'Thursday', '6:15pm', '8:30pm', '1st (RR)', '4th (RR)', 'Kerns Park 1', 'Game 16', ''],
  ['08/8/2026', 'Saturday', '3:00pm', '5:00pm', 'winner game 19', 'winner game 20', 'Ireland Park D3', 'Game 21', ''],
];

test('dates and times in the formats the league uses', () => {
  assert.equal(parseDate('05/12/2026'), '2026-05-12');
  assert.equal(parseDate('06/2/2026'), '2026-06-02');
  assert.equal(parseDate('25/05/2026'), '2026-05-25');
  assert.equal(parseDate('2026-05-12'), '2026-05-12');
  assert.equal(parseDate(new Date(Date.UTC(2026, 4, 12))), '2026-05-12');
  assert.equal(parseDate(46154), '2026-05-12'); // Excel serial number
  assert.equal(parseTime('6:15pm'), '18:15');
  assert.equal(parseTime('12:00 PM'), '12:00');
  assert.equal(parseTime('12:30am'), '00:30');
  assert.equal(parseTime(new Date(Date.UTC(1899, 11, 30, 18, 15))), '18:15');
  assert.equal(parseTime(0.75), '18:00');
  assert.equal(formatTime('18:15'), '6:15 PM');
});

test('schedule rows: regular games found, playoff placeholders set aside', () => {
  const s = parseScheduleRows([['2026 9U House League'], HEAD, ...ROWS]);
  assert.equal(s.games.length, 7);
  assert.equal(s.games.filter((g) => g.tbd).length, 3);
  assert.deepEqual(s.teams, ['Athletics', 'Blue Jays', 'Dodgers', 'Expos', 'Rockies', 'Yankees']);
  assert.deepEqual(s.problems, []);
  const first = s.games[0];
  assert.equal(first.date, '2026-05-12');
  assert.equal(first.time, '18:15');
  assert.equal(first.venue, 'Fothergill Woods');
});

test('no heading row gives a clear message', () => {
  const s = parseScheduleRows([['a', 'b'], ['1', '2']]);
  assert.equal(s.games.length, 0);
  assert.match(s.problems[0], /heading row/);
});

test('team schedule: numbered games with opponent and home/visitor', () => {
  const s = parseScheduleRows([HEAD, ...ROWS]);
  const mine = teamSchedule(s, 'Expos');
  assert.deepEqual(mine.map((g) => [g.gameNo, g.date, g.opponent, g.homeAway]), [
    ['1', '2026-05-12', 'Yankees', 'home'],
    ['2', '2026-05-14', 'Rockies', 'away'],
    ['3', '2026-06-02', 'Athletics', 'away'],
  ]);
  assert.equal(matchTeam(s.teams, 'expos'), 'Expos');
  assert.equal(matchTeam(s.teams, '9U Expos'), 'Expos');
  assert.equal(matchTeam(s.teams, 'Cubs'), null);
});

test('reads the league Excel file, Excel dates and times included', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Notes').addRow(['Nothing here']);
  const ws = wb.addWorksheet('9U HL');
  ws.addRow(HEAD);
  ws.addRow([new Date(Date.UTC(2026, 4, 12)), 'Tuesday', new Date(Date.UTC(1899, 11, 30, 18, 15)), new Date(Date.UTC(1899, 11, 30, 20, 30)), 'Expos', 'Yankees', 'Kerns Park 2', 'Game', 1]);
  ws.addRow([new Date(Date.UTC(2026, 4, 14)), 'Thursday', 0.7604166667, 0.8541666667, 'Rockies', 'Expos', 'Kerns Park 1', 'Game', '']);
  const s = await parseScheduleWorkbook(ExcelJS, await wb.xlsx.writeBuffer());
  assert.deepEqual(s.games.map((g) => [g.date, g.time, g.home]), [['2026-05-12', '18:15', 'Expos'], ['2026-05-14', '18:15', 'Rockies']]);
});

test('the Division Sheet template has a Schedule tab in the league layout', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(new URL('../templates/BOMBA_Division_Sheet_Template.xlsx', import.meta.url).pathname);
  const ws = wb.getWorksheet('Schedule');
  assert.ok(ws, 'Schedule tab');
  const s = await parseScheduleWorkbook(ExcelJS, await wb.xlsx.writeBuffer());
  assert.ok(s.games.length >= 1, 'example rows parse');
});

const state0 = () => {
  const team = sampleTeam();
  return { team, state: { version: 1, teams: [team], games: [], currentTeamId: team.id } };
};

test('applying the schedule creates games, and a newer file updates them without losing lineups', () => {
  const { team, state } = state0();
  const s1 = parseScheduleRows([HEAD, ...ROWS]);
  const r1 = applySchedule(state, team, s1, 'Expos');
  assert.deepEqual(r1, { added: 3, updated: 0, removed: 0, kept: 0 });
  assert.equal(state.games.length, 3);
  assert.ok(state.games.every((g) => g.attending.length === 12 && g.attendanceSet === false && !g.lineup));
  assert.deepEqual(team.divisionTeams, ['Athletics', 'Blue Jays', 'Dodgers', 'Rockies', 'Yankees']);
  assert.equal(team.scheduleName, 'Expos');

  // coach builds game 1; then the league moves game 2's diamond and drops game 3
  const g1 = state.games.find((g) => g.gameNo === '1');
  g1.lineup = generateFor(state, team, g1, { seed: 1 }).lineup;
  const rows2 = ROWS.filter((r) => r[4] !== 'Athletics').map((r) => (r[4] === 'Rockies' ? [...r.slice(0, 6), 'Sweetgrass', ...r.slice(7)] : r));
  const r2 = applySchedule(state, team, parseScheduleRows([HEAD, ...rows2]), 'Expos');
  assert.deepEqual(r2, { added: 0, updated: 1, removed: 1, kept: 0 });
  assert.equal(state.games.length, 2);
  assert.ok(state.games.find((g) => g.id === g1.id).lineup, 'lineup kept');
  assert.equal(state.games.find((g) => g.gameNo === '2').venue, 'Sweetgrass');

  // running the same file again changes nothing
  assert.deepEqual(applySchedule(state, team, parseScheduleRows([HEAD, ...rows2]), 'Expos'), { added: 0, updated: 0, removed: 0, kept: 0 });
});

test('scheduled games follow roster changes until the coach marks attendance', () => {
  const { team, state } = state0();
  applySchedule(state, team, parseScheduleRows([HEAD, ...ROWS]), 'Expos');
  const [a, b] = state.games;
  team.players.push({ ...team.players[0], id: 'p_new', first: 'New', jersey: '77' });
  assert.equal(syncAttendance(team, a), true);
  assert.ok(a.attending.includes('p_new'));
  b.attendanceSet = true;
  assert.equal(syncAttendance(team, b), false);
  assert.ok(!b.attending.includes('p_new'));
});

test('upcoming games, reset lineup and delete game', () => {
  const { team, state } = state0();
  applySchedule(state, team, parseScheduleRows([HEAD, ...ROWS]), 'Expos');
  assert.deepEqual(upcomingGames(state, team.id, '2026-05-13').map((g) => g.gameNo), ['2', '3']);
  const g = state.games[0];
  g.lineup = generateFor(state, team, g, { seed: 2 }).lineup;
  g.locks = [{}]; g.options = [g.lineup];
  const attending = [...g.attending];
  resetLineup(g);
  assert.equal(g.lineup, null);
  assert.deepEqual(g.locks, []);
  assert.deepEqual(g.options, []);
  assert.deepEqual(g.attending, attending);
  assert.equal(g.opponent, 'Yankees');
  deleteGame(state, g.id);
  assert.equal(state.games.length, 2);
  assert.ok(!state.games.includes(g));
});

test('a new game uses the local date', () => {
  const { team, state } = state0();
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(newGame(state, team).date, local);
});
