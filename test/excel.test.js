import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseRosterWorkbook, buildRosterWorkbook, parsePositions, markDuplicates } from '../src/app/excel.js';
import { sampleTeam, activePlayers } from '../src/app/model.js';

const ExcelJS = createRequire(import.meta.url)('exceljs');
const template = fs.readFileSync(new URL('../templates/BOMBA_Roster_Template.xlsx', import.meta.url));

test('the blank template imports as no players (example row skipped) with the team details', async () => {
  const r = await parseRosterWorkbook(ExcelJS, template);
  assert.equal(r.rows.length, 0);
  assert.equal(r.team.name, 'Expos');
  assert.equal(r.team.division, '8U');
});

test('save then import gives back the same roster', async () => {
  const team = sampleTeam();
  team.teamNo = '3';
  const players = activePlayers(team);
  const buf = await buildRosterWorkbook(ExcelJS, template, team, players);
  const r = await parseRosterWorkbook(ExcelJS, buf);
  assert.equal(r.team.name, 'Expos');
  assert.equal(r.team.teamNo, '3');
  assert.equal(r.rows.length, 12);
  assert.ok(r.rows.every((x) => x.problems.length === 0), JSON.stringify(r.rows.filter((x) => x.problems.length)));
  r.rows.forEach((x, i) => {
    const p = players[i];
    assert.equal(x.player.first, p.first);
    assert.equal(x.player.last, p.last);
    assert.equal(x.player.jersey, p.jersey);
    assert.deepEqual(x.player.cantPlay, p.cantPlay);
    assert.deepEqual(x.player.preferred, p.preferred);
    assert.equal(x.player.canPitch, p.canPitch);
    assert.equal(x.player.canCatch, p.canCatch);
  });
});

test('problems are found row by row', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const rs = wb.getWorksheet('Roster');
  const rows = [[18, 'Liam', 'Hall'], [18, 'Owen', 'Shah'], [11, '', 'Smith'], ['A', 'Kim', 'Lee', 'Q, C'], [4, 'Ty', 'Brown', '', 'lc rc']];
  rows.forEach((vals, i) => vals.forEach((v, j) => { rs.getCell(5 + i, 1 + j).value = v; }));
  rs.getCell('H5').value = null; // clear the example note so row 5 counts
  const r = await parseRosterWorkbook(ExcelJS, await wb.xlsx.writeBuffer());
  const byRow = Object.fromEntries(r.rows.map((x) => [x.row, x]));
  assert.match(byRow[5].problems.join(), /Same jersey # as Owen \(row 6\)/);
  assert.match(byRow[7].problems.join(), /First name is missing/);
  assert.match(byRow[8].problems.join(), /should be a number/);
  assert.match(byRow[8].problems.join(), /"Q" isn't a position/);
  assert.deepEqual(byRow[9].player.preferred, ['LCF', 'RCF']);
  assert.equal(byRow[9].problems.length, 0);
});

test('position text is forgiving', () => {
  assert.deepEqual(parsePositions('ss, 2b').ok, ['SS', '2B']);
  assert.deepEqual(parsePositions('C/P').ok, ['C', 'P']);
  assert.deepEqual(parsePositions('Left Center').ok, ['LCF']);
  assert.deepEqual(parsePositions('XX').bad, ['XX']);
});

test('adding to a roster flags jersey numbers already in use', () => {
  const rows = markDuplicates([{ row: 5, player: { jersey: '7', first: 'New' }, problems: [] }], [{ jersey: '7', first: 'Sam', last: 'Rivera' }]);
  assert.match(rows[0].problems[0], /already on your roster/);
});
