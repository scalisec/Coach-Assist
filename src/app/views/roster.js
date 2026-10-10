import { h, header, icon, inputField, toast, confirmDialog } from '../ui.js';
import { store } from '../store.js';
import { go, rerender } from '../main.js';
import { currentTeam, activePlayers, newPlayer, fullName, ALL_POSITIONS, getDivision } from '../model.js';
import { startImport, saveRosterToExcel } from './import.js';

export function rosterView() {
  const team = currentTeam(store.state);
  const players = activePlayers(team);
  const node = h('div', {},
    header({ title: 'Roster', sub: `${team.name} · ${team.division} HL`, right: h('span', { class: 'pill' }, `${players.length} players`) }),
    h('main', { class: 'page' },
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn primary', href: '#/player/new', 'data-test': 'add-player' }, icon('plus'), 'Add player'),
        h('button', { class: 'btn', onclick: startImport, 'data-test': 'import-excel' }, 'Import from Excel')),
      players.length ? h('button', { class: 'btn', onclick: saveRosterToExcel, 'data-test': 'save-excel' }, icon('doc'), 'Save roster to Excel') : null,
      players.length
        ? h('section', { class: 'card flush' }, players.map((p) => h('a', { class: 'row', href: `#/player/${p.id}` },
          h('span', { class: 'jersey' }, p.jersey || '–'),
          h('span', { class: 'grow' },
            h('span', { class: 'title' }, fullName(p) || 'Unnamed player'),
            notes(p, team) ? h('span', { class: 'note' }, notes(p, team)) : null),
          icon('chev', 'chev'))))
        : h('div', { class: 'card empty' }, 'No players yet. Tap Add player to start your roster.')));
  return { node, nav: 'roster' };
}

function notes(p, team) {
  const bits = [];
  if (p.cantPlay?.length) bits.push(`Can't play ${p.cantPlay.join(', ')}`);
  if (p.preferred?.length) bits.push(`Prefers ${p.preferred.join(', ')}`);
  if (getDivision(team.division).playerPitching) {
    const roles = [p.canPitch && 'pitch', p.canCatch && 'catch'].filter(Boolean);
    if (roles.length) bits.push(`Can ${roles.join(' & ')}`);
  }
  return bits.join(' · ');
}

export function playerView(id) {
  const team = currentTeam(store.state);
  const existing = team.players.find((p) => p.id === id);
  const isNew = !existing;
  const draft = structuredClone(existing || newPlayer());
  const div = getDivision(team.division);
  const positions = ALL_POSITIONS.filter((p) => div.outfielders === 4 ? p !== 'CF' : !['LCF', 'RCF'].includes(p));

  const chipSet = (key, cls, label, hint) => h('div', { class: 'field' }, label,
    h('div', { class: 'chips' }, positions.map((pos) => h('button', {
      type: 'button', class: `chip-toggle ${cls}`, 'aria-pressed': String(draft[key].includes(pos)),
      onclick: (e) => {
        const on = draft[key].includes(pos);
        draft[key] = on ? draft[key].filter((x) => x !== pos) : [...draft[key], pos];
        const other = key === 'cantPlay' ? 'preferred' : 'cantPlay';
        if (!on) draft[other] = draft[other].filter((x) => x !== pos);
        e.currentTarget.setAttribute('aria-pressed', String(!on));
        rerenderChips();
      },
    }, pos))),
    h('span', { class: 'hint' }, hint));

  const chipsBox = h('div', { style: 'display:flex;flex-direction:column;gap:14px' });
  const rerenderChips = () => chipsBox.replaceChildren(
    chipSet('cantPlay', 'no', "CAN'T PLAY", 'Never assigned here. Use for safety or a coach decision.'),
    chipSet('preferred', 'yes', 'PREFERRED', 'Tried first when the rules allow.'));
  rerenderChips();

  const save = () => {
    if (!draft.first.trim()) { toast('Add a first name'); return; }
    const dup = team.players.find((p) => p.id !== draft.id && p.active !== false && draft.jersey && String(p.jersey) === String(draft.jersey));
    if (dup) { toast(`#${draft.jersey} is already ${fullName(dup)}`); return; }
    draft.first = draft.first.trim(); draft.last = draft.last.trim(); draft.jersey = String(draft.jersey).trim();
    store.commit((s) => {
      const t = s.teams.find((x) => x.id === team.id);
      const i = t.players.findIndex((p) => p.id === draft.id);
      if (i >= 0) t.players[i] = draft; else t.players.push(draft);
    });
    toast(isNew ? 'Player added' : 'Player saved');
    go('#/roster');
  };

  const remove = async () => {
    if (!(await confirmDialog(`Remove ${fullName(draft)} from the roster? Saved games keep their lineups.`, 'Remove', { danger: true }))) return;
    store.commit((s) => {
      const t = s.teams.find((x) => x.id === team.id);
      const p = t.players.find((x) => x.id === draft.id);
      if (p) p.active = false;
    });
    go('#/roster');
  };

  const node = h('div', {},
    header({ title: isNew ? 'Add player' : fullName(draft), sub: `${team.name} · ${team.division} HL`, back: '#/roster' }),
    h('main', { class: 'page' },
      h('section', { class: 'card grid2' },
        inputField('FIRST NAME', draft.first, (v) => { draft.first = v; }, { test: 'player-first' }),
        inputField('LAST NAME', draft.last, (v) => { draft.last = v; }, { test: 'player-last' }),
        inputField('JERSEY #', draft.jersey, (v) => { draft.jersey = v; }, { inputmode: 'numeric', test: 'player-jersey', hint: 'Required on the score sheet (rule 4.4)' })),
      h('section', { class: 'card' }, chipsBox),
      div.playerPitching ? h('section', { class: 'card' },
        h('label', { class: 'switch-row' }, 'Can pitch', h('input', { type: 'checkbox', checked: !!draft.canPitch, onchange: (e) => { draft.canPitch = e.target.checked; } })),
        h('label', { class: 'switch-row' }, 'Can catch', h('input', { type: 'checkbox', checked: !!draft.canCatch, onchange: (e) => { draft.canCatch = e.target.checked; } })),
        h('span', { class: 'muted' }, `In ${team.division} only players marked here are scheduled to pitch or catch.`)) : null,
      isNew ? null : h('button', { class: 'btn danger', onclick: remove }, 'Remove from roster'),
      h('div', { class: 'footer-bar' },
        h('a', { class: 'btn', href: '#/roster' }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save, 'data-test': 'player-save' }, 'Save'))));
  return { node, nav: 'roster' };
}

export { rerender };
