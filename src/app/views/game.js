import { h, header, icon, inputField, selectField, segmented, toast, openSheet, confirmDialog } from '../ui.js';
import { store } from '../store.js';
import { go, rerender } from '../main.js';
import { activePlayers, gamePlayers, generateFor, fullName, displayShort, uid, DIVISION_CODES, getDivision, resetLineup, deleteGame, syncAttendance } from '../model.js';
import { fieldPositions } from '../../engine/index.js';

const OTHER = '__other';

export function gameSetupView(id) {
  const game = store.state.games.find((g) => g.id === id);
  const team = game && store.state.teams.find((t) => t.id === game.teamId);
  if (!game || !team) { go('#/home'); return null; }
  const div = getDivision(team.division);
  const update = (fn) => store.commit((s) => { const g = s.games.find((x) => x.id === id); fn(g); g.updatedAt = Date.now(); });
  if (!game.lineup && game.attendanceSet === false) {
    const copy = structuredClone(game);
    if (syncAttendance(team, copy)) update((g) => { g.attending = copy.attending; });
  }

  // opponent: dropdown of division teams (D27), with "Other team…" for anything else
  const teams = team.divisionTeams || [];
  const isOther = game.opponent && !teams.includes(game.opponent);
  const otherBox = h('div', { hidden: !isOther },
    inputField('OPPONENT NAME', isOther ? game.opponent : '', (v) => update((g) => { g.opponent = v; }), { test: 'opponent-other', placeholder: 'e.g. exhibition team' }));
  const opponent = selectField('OPPONENT', [
    { value: '', label: teams.length ? 'Pick a team' : 'Add division teams in Settings, or pick Other' },
    ...teams.map((t) => ({ value: t, label: t })),
    { value: OTHER, label: 'Other team…' },
  ], isOther ? OTHER : (game.opponent || ''), (v) => {
    otherBox.hidden = v !== OTHER;
    update((g) => { g.opponent = v === OTHER ? '' : v; });
  }, { class: 'span2', test: 'opponent' });

  const statusLine = h('span', { class: 'label', style: 'color:var(--navy);text-transform:none;letter-spacing:0;font-size:14px', 'data-test': 'here-status' });
  const updateStatus = () => {
    const n = gamePlayers(team, store.state.games.find((g) => g.id === id)).filter((p) => (p.availableFrom ?? 0) === 0).length;
    const spots = fieldPositions(div, n).length;
    const total = activePlayers(team).length + game.callUps.length;
    let txt = `${n} of ${total} here`;
    if (n < div.minStart) txt += ` · need ${div.minStart} to start`;
    else if (n > spots) txt += ` · ${n - spots} sit each inning`;
    else if (n < div.fielders) txt += ` · ${spots - 6} outfielder${spots - 6 === 1 ? '' : 's'}`;
    statusLine.textContent = txt;
  };

  const attend = h('div', { class: 'attend' }, activePlayers(team).map((p) => {
    const here = game.attending.includes(p.id);
    const lbl = h('label', { class: here ? 'on' : '' },
      h('input', { type: 'checkbox', checked: here, onchange: (e) => {
        const on = e.target.checked;
        lbl.classList.toggle('on', on);
        update((g) => { g.attending = on ? [...new Set([...g.attending, p.id])] : g.attending.filter((x) => x !== p.id); g.attendanceSet = true; });
        updateStatus();
      } }),
      h('span', { class: 'num' }, p.jersey),
      h('span', { class: 'nm' }, displayShort(p)));
    return lbl;
  }));

  const callUps = h('div', {}, game.callUps.map((c) => h('div', { class: 'row', style: 'padding:8px 0' },
    h('span', { class: 'jersey' }, c.jersey || '–'),
    h('span', { class: 'grow' }, h('span', { class: 'title' }, fullName(c)), h('span', { class: 'note' }, `Call-up from ${c.homeDivision}`)),
    h('button', { class: 'icon-btn', 'aria-label': `Remove ${fullName(c)}`, onclick: () => { update((g) => { g.callUps = g.callUps.filter((x) => x.id !== c.id); }); rerender(); } }, icon('trash')))));

  const addCallUp = () => {
    const idx = DIVISION_CODES.indexOf(team.division);
    const lower = DIVISION_CODES.slice(0, Math.max(idx, 1));
    const d = { id: uid('c'), first: '', last: '', jersey: '', homeDivision: lower[lower.length - 1] || team.division, canCatch: true, canPitch: false };
    openSheet('Add a call-up', (close) => [
      h('div', { class: 'grid2' },
        inputField('FIRST NAME', '', (v) => { d.first = v; }, { test: 'cu-first' }),
        inputField('LAST NAME', '', (v) => { d.last = v; }),
        inputField('JERSEY #', '', (v) => { d.jersey = v; }, { inputmode: 'numeric' }),
        selectField('FROM DIVISION', lower, d.homeDivision, (v) => { d.homeDivision = v; })),
      h('p', { class: 'muted', style: 'margin:0' }, div.playerPitching
        ? `Call-ups can't pitch and follow ${team.division} catching limits (rule 4.6). Tell your convenor (3.1.3).`
        : `Call-ups follow ${team.division} catching limits (rule 4.6). Tell your convenor (3.1.3).`),
      h('button', { class: 'btn primary big-btn', 'data-test': 'cu-save', onclick: () => {
        if (!d.first.trim()) { toast('Add a first name'); return; }
        update((g) => { g.callUps = [...g.callUps, d]; });
        close(); rerender();
      } }, 'Add call-up'),
    ]);
  };

  const generate = async () => {
    const g = store.state.games.find((x) => x.id === id);
    if (g.lineup && !(await confirmDialog('Replace the current lineup with a new one?', 'Replace'))) return;
    const res = generateFor(store.state, team, { ...g, locks: [] });
    if (!res.ok) {
      openSheet("Can't build a lineup yet", (close) => [h('p', { style: 'margin:0' }, res.message), h('button', { class: 'btn primary', onclick: close }, 'OK')], { center: true });
      return;
    }
    update((x) => { x.lineup = res.lineup; x.locks = []; x.options = []; x.optionIndex = 0; x.seed = res.seed; });
    go(`#/game/${id}`);
  };

  const node = h('div', {},
    header({ title: 'Game setup', sub: `${team.name} · ${team.division} HL`, back: game.lineup ? `#/game/${id}` : '#/home' }),
    h('main', { class: 'page' },
      h('section', { class: 'card grid2' },
        opponent,
        h('div', { class: 'span2' }, otherBox),
        inputField('DATE', game.date, (v) => update((g) => { g.date = v; }), { type: 'date', test: 'game-date' }),
        inputField('GAME #', game.gameNo, (v) => update((g) => { g.gameNo = v; }), { inputmode: 'numeric' }),
        inputField('START TIME', game.time || '', (v) => update((g) => { g.time = v; }), { type: 'time' }),
        inputField('DIAMOND', game.venue || '', (v) => update((g) => { g.venue = v; }), { placeholder: 'e.g. Kerns Park 1' }),
        h('div', { class: 'span2' }, segmented([{ value: 'home', label: 'Home' }, { value: 'away', label: 'Visitor' }], game.homeAway,
          (v) => { update((g) => { g.homeAway = v; }); rerender(); }, 'Home or visitor'))),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:8px' }, h('span', { class: 'label' }, "Who's here?"), statusLine),
        attend,
        callUps,
        h('button', { class: 'btn', style: 'border-style:dashed', onclick: addCallUp, 'data-test': 'add-callup' }, '+ Add a call-up'),
        h('span', { class: 'muted' }, 'Late? Leave them unticked; add them from the lineup when they arrive. They bat last (rule 3.2.6).')),
      gameActions(game, team, { onReset: () => rerender() }),
      h('div', { class: 'footer-bar' },
        h('button', { class: 'btn gold big-btn', onclick: generate, 'data-test': 'generate' }, icon('bolt'), game.lineup ? 'Generate new lineup' : 'Generate lineup'))));
  updateStatus();
  return { node, nav: 'lineup', noNav: true };
}

// Reset lineup / delete game / cancel a new game. Shared by game setup and the lineup screen.
export function gameActions(game, team, { onReset } = {}) {
  const id = game.id;
  const scheduled = !!game.scheduleKey;
  const reset = async () => {
    if (!(await confirmDialog('Clear this lineup and start again? Opponent, date and who\'s here stay as they are.', 'Reset lineup', { danger: true }))) return;
    store.commit((s) => resetLineup(s.games.find((x) => x.id === id)));
    toast('Lineup cleared');
    onReset ? onReset() : go(`#/game/${id}/setup`);
  };
  const remove = async () => {
    const msg = game.lineup
      ? `Delete this game and its lineup? This cannot be undone.${scheduled ? ' Loading the league schedule again will bring the game back.' : ''}`
      : scheduled ? 'Remove this game from your schedule? Loading the league schedule again will bring it back.' : 'Cancel this new game?';
    if (!(await confirmDialog(msg, game.lineup || scheduled ? 'Delete game' : 'Cancel game', { danger: true }))) return;
    store.commit((s) => deleteGame(s, id));
    toast(game.lineup || scheduled ? 'Game deleted' : 'Game cancelled');
    go('#/home');
  };
  if (!game.lineup) {
    return h('div', { class: 'game-actions' },
      h('button', { class: 'btn quiet danger-text', onclick: remove, 'data-test': scheduled ? 'delete-game' : 'cancel-game' }, icon('trash'), scheduled ? 'Remove from schedule' : 'Cancel this game'));
  }
  return h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
    h('div', { class: 'label' }, 'Start over'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: reset, 'data-test': 'reset-lineup' }, icon('undo'), 'Reset lineup'),
      h('button', { class: 'btn danger', onclick: remove, 'data-test': 'delete-game' }, icon('trash'), 'Delete game')));
}
