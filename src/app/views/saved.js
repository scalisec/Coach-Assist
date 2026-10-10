import { h, header, icon, confirmDialog, toast } from '../ui.js';
import { store, EMPTY_STATE } from '../store.js';
import { go, rerender } from '../main.js';
import { currentTeam, teamGames, activePlayers, newGame } from '../model.js';
import { gamesList } from './home.js';

export function savedView() {
  const team = currentTeam(store.state);
  const games = teamGames(store.state, team.id).filter((g) => g.lineup);

  const duplicate = (g) => {
    const copy = { ...newGame(store.state, team), opponent: g.opponent, homeAway: g.homeAway, attending: [...g.attending], callUps: structuredClone(g.callUps) };
    store.commit((s) => { s.games.push(copy); });
    go(`#/game/${copy.id}/setup`);
  };
  const remove = async (g) => {
    if (!(await confirmDialog('Delete this saved lineup?', 'Delete', { danger: true }))) return;
    store.commit((s) => { s.games = s.games.filter((x) => x.id !== g.id); });
    rerender();
  };

  const node = h('div', {},
    header({ title: 'Saved games', sub: `${team.name} · ${games.length} lineup${games.length === 1 ? '' : 's'}` }),
    h('main', { class: 'page' },
      games.length ? gamesList(team, games, 'All games') : h('div', { class: 'card empty' }, 'No saved lineups yet. Build one from Home.'),
      games.length ? h('section', { class: 'card flush' },
        h('div', { class: 'label', style: 'padding:12px 14px 2px' }, 'Manage'),
        games.map((g) => h('div', { class: 'row' },
          h('span', { class: 'grow' }, h('span', { class: 'title' }, `${g.gameNo ? `Game ${g.gameNo} · ` : ''}${g.opponent || 'Opponent'}`)),
          h('button', { class: 'btn', style: 'min-height:40px', onclick: () => duplicate(g) }, 'Reuse'),
          h('button', { class: 'icon-btn', 'aria-label': 'Delete', onclick: () => remove(g) }, icon('trash'))))) : null));
  return { node, nav: 'saved' };
}

export function settingsView() {
  const team = currentTeam(store.state);
  const clearAll = async () => {
    if (!(await confirmDialog('Erase every team, player and lineup on this device? This cannot be undone.', 'Erase everything', { danger: true }))) return;
    store.replace(EMPTY_STATE());
    toast('All data erased');
    go('#/');
  };
  const node = h('div', {},
    header({ title: 'Settings', sub: 'CoachAssist' }),
    h('main', { class: 'page' },
      h('section', { class: 'card flush' },
        h('div', { class: 'label', style: 'padding:12px 14px 2px' }, 'Teams on this device'),
        store.state.teams.map((t) => h('a', { class: 'row', href: `#/team/${t.id}` },
          h('span', { class: 'grow' }, h('span', { class: 'title' }, t.name), h('span', { class: 'note' }, `${t.division} HL · ${activePlayers(t).length} players${t.id === team.id ? ' · current' : ''}`)),
          icon('chev', 'chev'))),
        h('a', { class: 'row', href: '#/team/new' }, h('span', { class: 'grow' }, h('span', { class: 'title' }, '+ Add a team')))),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:6px' },
        h('div', { class: 'label' }, 'Coming in the next stages'),
        h('span', { class: 'muted' }, 'Excel roster import, backup and restore, league sign-in and updates, install to home screen.')),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        h('div', { class: 'label' }, 'Data on this device'),
        h('span', { class: 'muted' }, 'Rosters and lineups are stored only in this browser.'),
        h('button', { class: 'btn danger', onclick: clearAll }, 'Erase all data on this device')),
      h('p', { class: 'muted', style: 'text-align:center;margin:4px 0' }, 'CoachAssist · stage 2 preview · BOMBA Rules 2026')));
  return { node, nav: 'settings' };
}
