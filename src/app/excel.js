// Read and write the BOMBA Roster Template (templates/BOMBA_Roster_Template.xlsx).
// ExcelJS is passed in (window.ExcelJS in the browser, require('exceljs') in tests).

import { ALL_POSITIONS, DIVISION_CODES, newPlayer } from './model.js';

const ALIASES = { LC: 'LCF', RC: 'RCF', 'LEFT CENTER': 'LCF', 'RIGHT CENTER': 'RCF', CATCHER: 'C', PITCHER: 'P' };

export function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return cellText(v.result);
    if (v.text) return String(v.text).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v).trim();
}

export function parsePositions(text) {
  const bad = [];
  const list = String(text || '').toUpperCase().split(/[,;/]+|\s{2,}/).map((s) => s.trim()).filter(Boolean)
    .flatMap((s) => (ALIASES[s] ? [ALIASES[s]] : s.split(/\s+/)))
    .map((s) => ALIASES[s] || s);
  const ok = [];
  for (const s of list) (ALL_POSITIONS.includes(s) ? ok : bad).push(s);
  return { ok: [...new Set(ok)], bad };
}

const yes = (t) => /^(y|yes|true|1|x)$/i.test(String(t || '').trim());

/**
 * @returns {{team:object, rows:Array, fileProblems:string[]}}
 *   rows: [{row, player, problems:[...]}]; a row with problems is skipped until fixed
 */
export async function parseRosterWorkbook(ExcelJS, buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const fileProblems = [];
  const team = {};

  const ts = wb.getWorksheet('Team');
  if (ts) {
    const map = { 'team name': 'name', division: 'division', 'team #': 'teamNo', 'head coach': 'headCoach', 'coach 2': 'coach2', 'coach 3': 'coach3' };
    ts.eachRow((row) => {
      const key = map[cellText(row.getCell(2).value).toLowerCase()];
      if (key) team[key] = cellText(row.getCell(3).value);
    });
    if (team.division) {
      const d = team.division.toUpperCase().replace(/\s*HL$/, '').replace(/^U(\d+)$/, '$1U');
      team.division = DIVISION_CODES.includes(d) ? d : '';
      if (!team.division) fileProblems.push(`Division "${cellText(ts.getCell('C5').value)}" isn't one CoachAssist knows; your team's division is kept.`);
    }
  }

  const rs = wb.getWorksheet('Roster') || wb.worksheets.find((w) => /roster/i.test(w.name));
  if (!rs) return { team, rows: [], fileProblems: [...fileProblems, "This file has no Roster tab. Use the BOMBA Roster Template."] };

  // find the header row and columns by name, so a moved column still works
  let headerRow = 0;
  const col = {};
  rs.eachRow((row, n) => {
    if (headerRow) return;
    const names = row.values.map((v) => cellText(v).toLowerCase());
    if (names.includes('first name')) {
      headerRow = n;
      names.forEach((t, i) => {
        if (t === 'jersey #' || t === 'jersey' || t === '#') col.jersey = i;
        else if (t === 'first name') col.first = i;
        else if (t === 'last name') col.last = i;
        else if (t === "can't play" || t === 'cant play') col.cant = i;
        else if (t === 'preferred') col.pref = i;
        else if (t === 'can pitch') col.pitch = i;
        else if (t === 'can catch') col.catch = i;
        else if (t === 'notes') col.notes = i;
      });
    }
  });
  if (!headerRow) return { team, rows: [], fileProblems: [...fileProblems, 'Couldn\'t find the "First Name" column on the Roster tab.'] };

  const rows = [];
  const get = (row, c) => (c ? cellText(row.getCell(c).value) : '');
  for (let n = headerRow + 1; n <= rs.rowCount; n++) {
    const row = rs.getRow(n);
    const jersey = get(row, col.jersey), first = get(row, col.first), last = get(row, col.last);
    const notes = get(row, col.notes);
    if (!jersey && !first && !last) continue;
    if (/^example row/i.test(notes)) continue; // the template's sample row
    if (/:\s*$/.test(jersey)) continue;           // the template's totals under the table
    const cant = parsePositions(get(row, col.cant));
    const pref = parsePositions(get(row, col.pref));
    const problems = [];
    if (!first) problems.push('First name is missing');
    if (!last) problems.push('Last name is missing');
    if (!jersey) problems.push('Jersey # is missing');
    else if (!/^\d{1,2}$/.test(jersey)) problems.push(`Jersey # "${jersey}" should be a number from 0 to 99`);
    for (const b of [...cant.bad, ...pref.bad]) problems.push(`"${b}" isn't a position`);
    rows.push({
      row: n,
      player: newPlayer({ jersey, first, last, cantPlay: cant.ok, preferred: pref.ok.filter((p) => !cant.ok.includes(p)),
        canPitch: yes(get(row, col.pitch)), canCatch: yes(get(row, col.catch)) }),
      problems,
    });
  }
  markDuplicates(rows);
  return { team, rows, fileProblems };
}

// Duplicate jersey numbers within the file (and, optionally, against players already on the team).
export function markDuplicates(rows, existing = []) {
  for (const r of rows) r.problems = r.problems.filter((p) => !p.startsWith('Same jersey #'));
  for (const r of rows) {
    const j = r.player.jersey;
    if (!j) continue;
    const other = rows.find((o) => o !== r && o.player.jersey === j);
    if (other) r.problems.push(`Same jersey # as ${other.player.first || 'another player'} (row ${other.row})`);
    const ex = existing.find((p) => String(p.jersey) === j);
    if (ex) r.problems.push(`Same jersey # as ${ex.first} ${ex.last} already on your roster`);
  }
  return rows;
}

// Write a team's roster into the template, keeping its formatting, dropdowns and checks.
export async function buildRosterWorkbook(ExcelJS, templateBuffer, team, players) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);
  const ts = wb.getWorksheet('Team');
  ts.getCell('C4').value = team.name || null;
  ts.getCell('C5').value = team.division || null;
  ts.getCell('C6').value = team.teamNo || null;
  ts.getCell('C7').value = team.headCoach || null;
  ts.getCell('C8').value = team.coaches?.[0] || null;
  ts.getCell('C9').value = team.coaches?.[1] || null;
  const rs = wb.getWorksheet('Roster');
  const first = 5, last = 19;
  for (let n = first; n <= last; n++) for (const c of 'ABCDEFGH') rs.getCell(`${c}${n}`).value = null;
  players.slice(0, last - first + 1).forEach((p, i) => {
    const n = first + i;
    const num = Number(p.jersey);
    rs.getCell(`A${n}`).value = p.jersey === '' || Number.isNaN(num) ? (p.jersey || null) : num;
    rs.getCell(`B${n}`).value = p.first || null;
    rs.getCell(`C${n}`).value = p.last || null;
    rs.getCell(`D${n}`).value = (p.cantPlay || []).join(', ') || null;
    rs.getCell(`E${n}`).value = (p.preferred || []).join(', ') || null;
    rs.getCell(`F${n}`).value = p.canPitch ? 'Y' : 'N';
    rs.getCell(`G${n}`).value = p.canCatch ? 'Y' : 'N';
    for (const c of 'ABCDEFG') rs.getCell(`${c}${n}`).font = { name: 'Arial', color: { argb: 'FF0000FF' } };
  });
  wb.calcProperties = { fullCalcOnLoad: true }; // Excel recalculates the Check column on open
  return wb.xlsx.writeBuffer();
}
