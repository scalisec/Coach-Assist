import { h, header, icon, openSheet, confirmDialog, toast } from '../ui.js';
import { store } from '../store.js';
import { go, rerender } from '../main.js';
import { restoreFromFile } from './saved.js';
import { APP_VERSION } from '../version.js';
import { currentTeam, activePlayers, teamGames, newGame, sampleTeam, check, gameTitle, formatDate, getDivision, upcomingGames, unscheduledDraft, deleteGame, todayISO } from '../model.js';
import { formatTime } from '../schedule.js';

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
      h('button', { class: 'btn ghost', style: 'min-height:44px;font-size:15px;border:none', onclick: restoreFromFile, 'data-test': 'welcome-restore' }, 'Restore a backup'),
      h('p', { style: 'font-size:13px;text-align:center;margin:4px 0 0' }, 'League sign-in arrives in a later version. For now your team is stored on this device only.'),
      h('p', { style: 'font-size:12px;text-align:center;margin:0;opacity:.7' }, `Version ${APP_VERSION}`)));
  return { node, noNav: true };
}

export function homeView({ notice } = {}) {
  const state = store.state;
  const team = currentTeam(state);
  if (!team) return welcomeView();
  const players = activePlayers(team);
  const div = getDivision(team.division);
  const games = teamGames(state, team.id);
  const upcoming = upcomingGames(state, team.id);
  const draft = unscheduledDraft(state, team.id);
  // the game card shows the soonest game from today on; an older unfinished draft still counts
  const next = upcoming[0] || draft || null;

  const openGame = (g) => go(g.lineup ? `#/game/${g.id}` : `#/game/${g.id}/setup`);
  const newOne = () => {
    if (draft) {
      if (draft.date < todayISO()) store.commit((s) => { s.games.find((x) => x.id === draft.id).date = todayISO(); });
      go(`#/game/${draft.id}/setup`); return;
    }
    const g = newGame(state, team);
    store.commit((s) => { s.games.push(g); });
    go(`#/game/${g.id}/setup`);
  };
  const cancelDraft = async () => {
    if (!(await confirmDialog('Cancel this new game?', 'Cancel game', { danger: true }))) return;
    store.commit((s) => deleteGame(s, draft.id));
    toast('Game cancelled');
    rerender();
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
          h('div', { style: 'display:flex;align-items:center;gap:8px' }, h('span', { class: 'big', 'data-test': 'team-title' }, team.name), h('span', { class: 'pill', 'data-test': 'division-pill' }, `${team.division} HL`)),
          h('div', { class: 'muted' }, `${players.length} players · ${div.innings} innings · ${div.fielders} fielders`)),
        h('button', { class: 'btn', onclick: switchTeam }, 'Switch team')),
      nextCard(next, players, { openGame, newOne, cancelDraft: next && next === draft && !next.lineup ? cancelDraft : null }),
      upcomingList(upcoming.filter((g) => g !== next).slice(0, 4), 'Coming up'),
      h('section', { class: 'grid2' },
        h('a', { class: 'card', href: '#/roster', style: 'text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:4px' },
          icon('roster'), h('b', {}, 'Roster'), h('span', { class: 'muted' }, `${players.length} players`)),
        h('a', { class: 'card', href: '#/saved', style: 'text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:4px' },
          icon('saved'), h('b', {}, 'Games'), h('span', { class: 'muted' }, upcoming.length ? `${upcoming.length} coming up` : `${games.filter((g) => g.lineup).length} lineups`))),
      gamesList(team, games.filter((g) => g.lineup).slice(0, 3), 'Recent games')));
  return { node, nav: 'home' };
}

const when = (g) => [formatDate(g.date), formatTime(g.time), g.venue].filter(Boolean).join(' · ');

function nextCard(next, players, { openGame, newOne, cancelDraft }) {
  const ready = players.length > 0;
  if (!next) {
    return h('section', { class: 'card navy', style: 'display:flex;flex-direction:column;gap:12px' },
      h('div', { class: 'label' }, 'Next game'),
      h('div', { class: 'big' }, 'Ready when you are'),
      h('div', { style: 'color:var(--on-navy);font-size:15px' }, "Pick who's here and get a fair-play lineup in one tap."),
      h('button', { class: 'btn gold big-btn', onclick: newOne, 'data-test': 'build-lineup', disabled: !ready }, icon('bolt'), ready ? 'Build lineup' : 'Add players first'));
  }
  const status = next.lineup ? 'lineup ready' : next.scheduleKey ? "mark who's here, then build" : 'lineup not built yet';
  return h('section', { class: 'card navy', style: 'display:flex;flex-direction:column;gap:12px', 'data-test': 'next-game' },
    h('div', { class: 'label' }, next.scheduleKey || next.lineup ? `Next game${next.gameNo ? ` · Game ${next.gameNo}` : ''}` : 'Game in progress'),
    h('div', { class: 'big' }, gameTitle(next)),
    h('div', { style: 'color:var(--on-navy);font-size:15px' }, `${when(next)} · ${status}`),
    h('button', { class: 'btn gold big-btn', onclick: () => openGame(next), 'data-test': 'build-lineup', disabled: !ready && !next.lineup }, icon('bolt'),
      next.lineup ? 'Open lineup' : ready ? 'Build lineup' : 'Add players first'),
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;color:var(--on-navy);font-size:14px' },
      next.scheduleKey || next.lineup ? h('button', { class: 'link-btn', onclick: newOne, 'data-test': 'other-game' }, next.scheduleKey ? '+ A game not on the schedule' : '+ Another game') : h('span'),
      cancelDraft ? h('button', { class: 'link-btn', onclick: cancelDraft, 'data-test': 'cancel-draft' }, 'Cancel this game') : null));
}

export function upcomingList(games, title) {
  if (!games.length) return null;
  return h('section', { class: 'card flush', 'data-test': 'upcoming' },
    h('div', { class: 'label', style: 'padding:12px 14px 2px' }, title),
    games.map((g) => h('a', { class: 'row', href: g.lineup ? `#/game/${g.id}` : `#/game/${g.id}/setup` },
      h('span', { class: 'grow' },
        h('span', { class: 'title' }, `${g.gameNo ? `Game ${g.gameNo} · ` : ''}${gameTitle(g)}`),
        h('span', { class: 'note' }, when(g))),
      g.lineup ? h('span', { class: 'badge good' }, 'Lineup ready') : icon('chev', 'chev'))));
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
