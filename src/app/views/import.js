import { h, header, icon, toast, openSheet, inputField, segmented } from '../ui.js';
import { store } from '../store.js';
import { go, rerender } from '../main.js';
import { currentTeam, activePlayers, fullName } from '../model.js';
import { parseRosterWorkbook, buildRosterWorkbook, markDuplicates } from '../excel.js';
import { loadExcel, fetchBytes, pickFile, deliverFile } from '../files.js';

let pending = null; // { fileName, team, rows, fileProblems, mode, useTeam }

export async function startImport() {
  const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!file) return;
  try {
    toast('Reading the roster…');
    const ExcelJS = await loadExcel();
    const parsed = await parseRosterWorkbook(ExcelJS, await file.arrayBuffer());
    const team = currentTeam(store.state);
    const hasPlayers = activePlayers(team).length > 0;
    pending = { fileName: file.name, ...parsed, mode: hasPlayers ? 'add' : 'replace', useTeam: !hasPlayers };
    recheck();
    go('#/import');
  } catch (e) {
    toast(/zip|central directory|signature/i.test(e.message) ? "That file isn't an Excel (.xlsx) file." : e.message);
  }
}

export async function saveRosterToExcel() {
  const team = currentTeam(store.state);
  try {
    toast('Preparing the Excel file…');
    const [ExcelJS, tpl] = await Promise.all([loadExcel(), fetchBytes('templates/BOMBA_Roster_Template.xlsx')]);
    const buf = await buildRosterWorkbook(ExcelJS, tpl, team, activePlayers(team));
    const name = `${team.name.replace(/[^A-Za-z0-9]+/g, '-')}-Roster.xlsx`;
    const how = await deliverFile(new Blob([buf]), name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(how === 'shared' ? 'Roster shared' : `Saved ${name}`);
  } catch (e) { toast(e.message); }
}

function recheck() {
  const team = currentTeam(store.state);
  for (const r of pending.rows) {
    const p = r.player;
    r.problems = r.problems.filter((x) => !/missing|should be a number/.test(x));
    if (!p.first) r.problems.push('First name is missing');
    if (!p.last) r.problems.push('Last name is missing');
    if (!p.jersey) r.problems.push('Jersey # is missing');
    else if (!/^\d{1,2}$/.test(p.jersey)) r.problems.push(`Jersey # "${p.jersey}" should be a number from 0 to 99`);
  }
  markDuplicates(pending.rows, pending.mode === 'add' ? activePlayers(team) : []);
}

function fixRow(r) {
  const d = { ...r.player };
  openSheet(`Fix row ${r.row}`, (close) => [
    h('div', { class: 'grid2' },
      inputField('FIRST NAME', d.first, (v) => { d.first = v.trim(); }),
      inputField('LAST NAME', d.last, (v) => { d.last = v.trim(); }),
      inputField('JERSEY #', d.jersey, (v) => { d.jersey = v.trim(); }, { inputmode: 'numeric' })),
    r.problems.filter((p) => /position/.test(p)).length
      ? h('p', { class: 'muted', style: 'margin:0' }, "Positions CoachAssist didn't recognise were dropped. You can set positions on the player's page after importing.") : null,
    h('button', { class: 'btn primary big-btn', onclick: () => {
      r.player = d;
      r.problems = r.problems.filter((p) => !/position/.test(p));
      recheck(); close(); rerender();
    } }, 'Save'),
  ]);
}

export function importView() {
  if (!pending) { go('#/roster'); return null; }
  const team = currentTeam(store.state);
  const ready = pending.rows.filter((r) => !r.problems.length);
  const broken = pending.rows.filter((r) => r.problems.length);
  const t = pending.team || {};
  const fileTeamDiffers = t.name && (t.name !== team.name || (t.division && t.division !== team.division));

  const doImport = () => {
    store.commit((s) => {
      const tm = s.teams.find((x) => x.id === team.id);
      if (pending.mode === 'replace') tm.players.forEach((p) => { p.active = false; });
      tm.players.push(...ready.map((r) => r.player));
      if (pending.useTeam && t.name) {
        tm.name = t.name;
        if (t.division) tm.division = t.division;
        if (t.teamNo) tm.teamNo = t.teamNo;
        if (t.headCoach) tm.headCoach = t.headCoach;
        tm.coaches = [t.coach2 || tm.coaches[0] || '', t.coach3 || tm.coaches[1] || ''];
      }
    });
    toast(`${ready.length} player${ready.length === 1 ? '' : 's'} imported`);
    pending = null;
    go('#/roster');
  };

  const node = h('div', {},
    header({ title: 'Import roster', sub: `${team.name} · ${team.division} HL`, back: '#/roster' }),
    h('main', { class: 'page' },
      h('section', { class: 'card', style: 'display:flex;gap:12px;align-items:center' },
        h('span', { class: 'jersey', style: 'border-radius:10px;background:var(--good-bg);color:var(--good)' }, icon('doc')),
        h('span', { style: 'display:flex;flex-direction:column;min-width:0' },
          h('b', { style: 'overflow:hidden;text-overflow:ellipsis' }, pending.fileName),
          h('span', { class: 'muted' }, [t.name ? `Team: ${t.name}` : null, t.division ? `Division: ${t.division}` : null, `${pending.rows.length} players`].filter(Boolean).join(' · ')))),
      pending.fileProblems.map((p) => h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'grow' }, p))),
      h('section', { class: 'grid2' },
        h('div', { class: 'card', style: 'background:var(--good-bg);border-color:var(--good-line)' },
          h('div', { class: 'big', style: 'color:var(--good)', 'data-test': 'import-ready' }, String(ready.length)), h('span', { style: 'color:var(--good);font-weight:600;font-size:13px' }, 'ready to import')),
        h('div', { class: 'card', style: 'background:#FBE4E4;border-color:var(--bad-line)' },
          h('div', { class: 'big', style: 'color:var(--bad)' }, String(broken.length)), h('span', { style: 'color:var(--bad);font-weight:600;font-size:13px' }, 'need a fix'))),
      broken.length ? h('section', { class: 'card flush' }, broken.map((r) => h('div', { class: 'row', style: 'background:var(--bad-bg)' },
        h('span', { class: 'grow' }, h('span', { class: 'title' }, `Row ${r.row} · ${fullName(r.player) || 'No name'}${r.player.jersey ? ` · #${r.player.jersey}` : ''}`),
          h('span', { class: 'note', style: 'color:var(--bad)' }, r.problems.join('; '))),
        h('button', { class: 'btn danger', style: 'min-height:38px', onclick: () => fixRow(r) }, 'Fix')))) : null,
      ready.length ? h('section', { class: 'card flush' }, ready.map((r) => h('div', { class: 'row' },
        h('span', { class: 'jersey' }, r.player.jersey),
        h('span', { class: 'grow' }, h('span', { class: 'title' }, fullName(r.player)),
          r.player.cantPlay.length || r.player.preferred.length ? h('span', { class: 'note' },
            [r.player.cantPlay.length ? `Can't play ${r.player.cantPlay.join(', ')}` : '', r.player.preferred.length ? `Prefers ${r.player.preferred.join(', ')}` : ''].filter(Boolean).join(' · ')) : null)))) : null,
      activePlayers(team).length ? h('div', { class: 'field' }, 'IMPORT AS',
        segmented([{ value: 'replace', label: 'New roster' }, { value: 'add', label: 'Add to current' }], pending.mode,
          (v) => { pending.mode = v; recheck(); rerender(); }, 'Import mode'),
        h('span', { class: 'hint' }, pending.mode === 'replace' ? `Replaces the ${activePlayers(team).length} players now on ${team.name}. Saved games keep their lineups.` : `Adds to the ${activePlayers(team).length} players already on ${team.name}.`)) : null,
      fileTeamDiffers ? h('label', { class: 'switch-row card' }, `Also use the file's team details (${t.name}${t.division ? `, ${t.division}` : ''})`,
        h('input', { type: 'checkbox', checked: pending.useTeam, onchange: (e) => { pending.useTeam = e.target.checked; } })) : null,
      h('div', { class: 'footer-bar', style: 'flex-direction:column' },
        h('button', { class: 'btn primary big-btn', disabled: !ready.length, onclick: doImport, 'data-test': 'import-go' }, `Import ${ready.length} player${ready.length === 1 ? '' : 's'}`),
        broken.length ? h('span', { class: 'muted', style: 'text-align:center' }, 'Rows that need a fix are skipped until fixed.') : null)));
  return { node, nav: 'roster', noNav: true };
}

// for tests
export const _setPending = (p) => { pending = p; };
