import { h, header, icon, openSheet } from '../ui.js';
import { store } from '../store.js';
import { go, rerender } from '../main.js';
import { currentTeam, activePlayers, teamGames, newGame, sampleTeam, check, gameTitle, formatDate, getDivision } from '../model.js';

export function welcomeView() {
  const trySample = () => {
    const t = sampleTeam();
    store.commit((s) => { s.teams.push(t); s.currentTeamId = t.id; });
    go('#/home');
  };
  const node = h('div', { class: 'welcome' },
    h('div', { class: 'logo', style: 'color:var(--navy)' }, icon('diamond')),
    h('div', { class: 'top', style: 'background:none;padding:18px 0 0' }, h('div', { class: 'eyebrow' }, 'BOMBA HOUSE LEAGUE')),
    h('h1', {}, 'CoachAssist'),
    h('p', {}, 'Fair-play lineups and the official score sheet in a few taps.'),
    h('div', { class: 'actions' },
      h('a', { class: 'btn light', href: '#/team/new', 'data-test': 'create-team' }, 'Set up my team'),
      h('button', { class: 'btn ghost', onclick: trySample, 'data-test': 'try-sample' }, 'Try it with a sample team'),
      h('p', { style: 'font-size:13px;text-align:center;margin:4px 0 0' }, 'League sign-in arrives in a later version. For now your team is stored on this device only.')));
  return { node, noNav: true };
}

export function homeView({ notice } = {}) {
  const state = store.state;
  const team = currentTeam(state);
  if (!team) return welcomeView();
  const players = activePlayers(team);
  const div = getDivision(team.division);
  const games = teamGames(state, team.id);
  const draft = games.find((g) => !g.lineup);

  const build = () => {
    if (draft) { go(`#/game/${draft.id}/setup`); return; }
    const g = newGame(state, team);
    store.commit((s) => { s.games.push(g); });
    go(`#/game/${g.id}/setup`);
  };

  const switchTeam = () => openSheet('Switch team', (close) => [
    h('div', { class: 'card flush' }, state.teams.map((t) => h('button', { class: 'row', onclick: () => { store.commit((s) => { s.currentTeamId = t.id; }); close(); rerender(); } },
      h('span', { class: 'grow' }, h('span', { class: 'title' }, t.name), h('span', { class: 'note' }, `${t.division} HL · ${activePlayers(t).length} players`)),
      t.id === team.id ? h('span', { class: 'badge good' }, 'Current') : null))),
    h('a', { class: 'btn', href: '#/team/new', onclick: close }, icon('plus'), 'Add another team'),
  ]);

  const node = h('div', {},
    header({ eyebrow: 'BOMBA HOUSE LEAGUE', title: 'CoachAssist' }),
    h('main', { class: 'page' },
      notice ? h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'grow' }, notice)) : null,
      h('section', { class: 'card', style: 'display:flex;align-items:center;justify-content:space-between;gap:12px' },
        h('div', {},
          h('div', { class: 'label' }, 'My team'),
          h('div', { class: 'big', 'data-test': 'team-title' }, team.name),
          h('div', { class: 'muted' }, `${team.division} HL · ${players.length} players · ${div.innings} innings`)),
        h('button', { class: 'btn', onclick: switchTeam }, 'Switch team')),
      h('section', { class: 'card navy', style: 'display:flex;flex-direction:column;gap:12px' },
        h('div', { class: 'label' }, draft ? 'Game in progress' : 'Next game'),
        h('div', { class: 'big' }, draft ? `${gameTitle(draft)}` : 'Ready when you are'),
        h('div', { style: 'color:var(--on-navy);font-size:15px' }, draft ? `${formatDate(draft.date)} · lineup not built yet` : 'Pick who is here and get a fair-play lineup in one tap.'),
        h('button', { class: 'btn gold big-btn', onclick: build, 'data-test': 'build-lineup', disabled: players.length === 0 }, icon('bolt'), players.length ? 'Build lineup' : 'Add players first')),
      h('section', { class: 'grid2' },
        h('a', { class: 'card', href: '#/roster', style: 'text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:4px' },
          icon('roster'), h('b', {}, 'Roster'), h('span', { class: 'muted' }, `${players.length} players`)),
        h('a', { class: 'card', href: '#/saved', style: 'text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:4px' },
          icon('saved'), h('b', {}, 'Saved games'), h('span', { class: 'muted' }, `${games.filter((g) => g.lineup).length} lineups`))),
      gamesList(team, games.filter((g) => g.lineup).slice(0, 3), 'Recent games')));
  return { node, nav: 'home' };
}

export function gamesList(team, games, title) {
  if (!games.length) return null;
  return h('section', { class: 'card flush' },
    h('div', { class: 'label', style: 'padding:12px 14px 2px' }, title),
    games.map((g) => {
      const r = check(team, g);
      return h('a', { class: 'row', href: `#/game/${g.id}` },
        h('span', { class: 'grow' },
          h('span', { class: 'title' }, `${g.gameNo ? `Game ${g.gameNo} · ` : ''}${gameTitle(g)}`),
          h('span', { class: 'note' }, `${formatDate(g.date)} · ${g.lineup.battingOrder.length} players`)),
        r?.ok ? h('span', { class: 'badge good' }, 'Fair play ✓') : h('span', { class: 'badge bad' }, `${r.errors.length} issue${r.errors.length === 1 ? '' : 's'}`));
    }));
}
