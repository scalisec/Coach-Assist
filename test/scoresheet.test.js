import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { sampleTeam, newGame, generateFor, scoreSheetData, scoreSheetFileName, swapCell, SIT } from '../src/app/model.js';
import { fillScoreSheet } from '../src/app/pdf/scoresheet.js';
import { SLOTS, HEADER } from '../src/app/pdf/fieldmap.js';

const PDFLib = createRequire(import.meta.url)('pdf-lib');
const template = fs.readFileSync(new URL('../assets/score_sheet.pdf', import.meta.url));

function makeGame(mutate = () => {}) {
  const team = sampleTeam();
  team.teamNo = '3';
  team.coaches = ['Assistant One', ''];
  const state = { teams: [team], games: [] };
  const game = { ...newGame(state, team), opponent: 'Rockies', gameNo: '5', date: '2026-10-17' };
  mutate(team, game);
  game.lineup = generateFor(state, team, game, { seed: 11 }).lineup;
  return { team, game };
}

async function filledFields(team, game) {
  const bytes = await fillScoreSheet(PDFLib, template, scoreSheetData(team, game), { flatten: false });
  const form = (await PDFLib.PDFDocument.load(bytes)).getForm();
  return (name) => form.getTextField(name).getText() || '';
}

test('field map covers all 15 slots with 7 innings each, starter and substitute lines', () => {
  assert.equal(SLOTS.length, 15);
  const names = SLOTS.flatMap((s) => [s.num, s.name, ...s.pos, s.sub.num, s.sub.name, ...s.sub.pos]);
  assert.equal(new Set(names).size, 15 * 2 * 9);
  assert.equal(names.length + 11, 281, 'plus 11 header/coach fields = every field in the form');
});

test('header, batting order, positions and SIT are written to the right fields', async () => {
  const { team, game } = makeGame();
  const get = await filledFields(team, game);
  assert.equal(get(HEADER.division), '8U HL');
  assert.equal(get(HEADER.team1Name), 'Expos');
  assert.equal(get(HEADER.team1No), '3');
  assert.equal(get(HEADER.team2Name), 'Rockies');
  assert.equal(get(HEADER.gameNo), '5');
  assert.equal(get(HEADER.date), '2026-10-17');
  assert.equal(get(HEADER.headCoach), 'Sample Coach');
  assert.equal(get(HEADER.coaches[0]), 'Assistant One');
  const byId = new Map(team.players.map((p) => [p.id, p]));
  game.lineup.battingOrder.forEach((id, i) => {
    const p = byId.get(id);
    assert.equal(get(SLOTS[i].name), `${p.first} ${p.last}`);
    assert.equal(get(SLOTS[i].num), p.jersey);
    for (let k = 0; k < 6; k++) assert.equal(get(SLOTS[i].pos[k]), game.lineup.innings[k][id]);
    assert.equal(get(SLOTS[i].pos[6]), '', '7th inning column empty in a 6-inning game');
    assert.equal(get(SLOTS[i].sub.name), '', 'substitute line blank (D11)');
  });
  assert.ok(game.lineup.innings.some((row) => Object.values(row).includes(SIT)));
  assert.equal(get(SLOTS[12].name), '', 'unused slots stay blank');
});

test('call-ups are marked (CU) and 13U uses all 7 inning columns', async () => {
  const { team, game } = makeGame((t, g) => {
    t.division = '13U';
    t.players.forEach((p) => { p.canPitch = true; p.canCatch = true; });
    g.callUps = [{ id: 'c_1', first: 'Callum', last: 'Up', jersey: '99', homeDivision: '11U' }];
  });
  const get = await filledFields(team, game);
  const slot = game.lineup.battingOrder.indexOf('c_1');
  assert.equal(get(SLOTS[slot].name), 'Callum Up (CU)');
  assert.ok(get(SLOTS[0].pos[6]) !== '', '13U plays 7 innings');
});

test('a non-compliant lineup is still exported, flagged for the Convenor', async () => {
  const { team, game } = makeGame();
  const row = game.lineup.innings[1];
  const sitter = Object.keys(row).find((id) => row[id] === SIT);
  const fielder = Object.keys(game.lineup.innings[0]).find((id) => game.lineup.innings[0][id] !== SIT && row[id] !== SIT);
  // make the inning-2 sitter also sit inning 1 (rule 4.1)
  const first = game.lineup.innings[0];
  const sitter1 = Object.keys(first).find((id) => first[id] === SIT);
  game.lineup = swapCell(game.lineup, 0, sitter, SIT, sitter1 === sitter ? fielder : sitter1);
  const data = scoreSheetData(team, game);
  assert.equal(data.compliant, false);
  const bytes = await fillScoreSheet(PDFLib, template, data);
  assert.ok(bytes.length > 500000);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
});

test('file name is readable and safe', () => {
  const { team, game } = makeGame();
  assert.equal(scoreSheetFileName(team, game), 'Expos-vs-Rockies-Game5-2026-10-17.pdf');
});
