import { h, header, icon, confirmDialog, toast } from '../ui.js';
import { store, EMPTY_STATE } from '../store.js';
import { go, rerender } from '../main.js';
import { currentTeam, teamGames, activePlayers, newGame } from '../model.js';
import { gamesList } from './home.js';
import { makeBackup, backupFileName, parseBackup } from '../backup.js';
import { pickFile, deliverFile } from '../files.js';
import { APP_VERSION, APP_BUILT } from '../version.js';

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

export async function restoreFromFile() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  const r = parseBackup(await file.text());
  if (!r.ok) { toast(r.message); return; }
  const when = r.exportedAt ? new Date(r.exportedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'an earlier date';
  const replacing = store.state.teams.length ? 'Replace everything on this device with' : 'Restore';
  if (!(await confirmDialog(`${replacing} the backup from ${when} (${r.summary})?`, 'Restore', { danger: store.state.teams.length > 0 }))) return;
  store.replace(r.state);
  toast('Backup restored');
  go('#/home');
}

export function settingsView() {
  const team = currentTeam(store.state);
  const clearAll = async () => {
    if (!(await confirmDialog('Erase every team, player and lineup on this device? This cannot be undone.', 'Erase everything', { danger: true }))) return;
    store.replace(EMPTY_STATE());
    toast('All data erased');
    go('#/');
  };
  const backup = async () => {
    const now = new Date();
    store.commit((s) => { s.lastBackup = now.getTime(); });
    const how = await deliverFile(new Blob([makeBackup(store.state, now)]), backupFileName(now), 'application/json');
    toast(how === 'shared' ? 'Backup shared' : 'Backup saved to your downloads');
    rerender();
  };
  const restore = restoreFromFile;
  const last = store.state.lastBackup;
  const stale = !last || Date.now() - last > 30 * 864e5;

  const node = h('div', {},
    header({ title: 'Settings', sub: `CoachAssist v${APP_VERSION}` }),
    h('main', { class: 'page' },
      h('section', { class: 'card flush' },
        h('div', { class: 'label', style: 'padding:12px 14px 2px' }, 'Teams on this device'),
        store.state.teams.map((t) => h('a', { class: 'row', href: `#/team/${t.id}` },
          h('span', { class: 'grow' }, h('span', { class: 'title' }, t.name), h('span', { class: 'note' }, `${t.division} HL · ${activePlayers(t).length} players${t.id === team.id ? ' · current' : ''}`)),
          icon('chev', 'chev'))),
        h('a', { class: 'row', href: '#/team/new' }, h('span', { class: 'grow' }, h('span', { class: 'title' }, '+ Add a team')))),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:6px' },
        h('div', { class: 'label' }, 'Coming in the next stages'),
        h('span', { class: 'muted' }, 'League sign-in and updates, install to home screen.')),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        h('div', { class: 'label' }, 'Backup'),
        h('span', { class: 'muted' }, last ? `Last backup ${new Date(last).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.` : 'No backup yet.'),
        stale ? h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'grow' }, 'Back up now and then, so a lost or replaced phone doesn\'t lose your rosters and lineups.')) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: backup, 'data-test': 'backup' }, 'Back up'),
          h('button', { class: 'btn', onclick: restore, 'data-test': 'restore' }, 'Restore')),
        h('span', { class: 'muted' }, 'A backup is one file with every team, roster and saved lineup. Restore it on any phone or computer.')),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        h('div', { class: 'label' }, 'Data on this device'),
        h('span', { class: 'muted' }, 'Rosters and lineups are stored only in this browser.'),
        h('button', { class: 'btn danger', onclick: clearAll }, 'Erase all data on this device')),
      versionCard()));
  return { node, nav: 'settings' };
}

// Version check: compares this copy with the latest one published on the website.
function versionCard() {
  const status = h('span', { class: 'muted', 'data-test': 'latest-version' }, 'Checking for a newer version…');
  const reload = h('button', { class: 'btn primary', hidden: true, onclick: () => location.reload() }, 'Load the latest version');
  fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v) => {
    if (!v?.version) { status.textContent = "Couldn't check for updates (offline?)."; return; }
    if (newer(v.version, APP_VERSION)) {
      status.textContent = `Version ${v.version} is available.`;
      reload.hidden = false;
    } else status.textContent = 'You have the latest version.';
  }).catch(() => { status.textContent = "Couldn't check for updates (offline?)."; });
  return h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:8px' },
    h('div', { class: 'label' }, 'About'),
    h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:8px' },
      h('b', { 'data-test': 'app-version' }, `CoachAssist v${APP_VERSION}`),
      h('span', { class: 'muted' }, `Built ${APP_BUILT}`)),
    status, reload,
    h('span', { class: 'muted' }, 'Follows the BOMBA Rules (amended 2026).'));
}

const newer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};
