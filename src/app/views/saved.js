import { h, header, icon, confirmDialog, toast, openSheet, selectField } from '../ui.js';
import { store, EMPTY_STATE } from '../store.js';
import { go, rerender } from '../main.js';
import { currentTeam, teamGames, activePlayers, newGame, upcomingGames, deleteGame, formatDate } from '../model.js';
import { gamesList, upcomingList } from './home.js';
import { parseScheduleWorkbook, matchTeam, teamSchedule, applySchedule } from '../schedule.js';
import { loadExcel } from '../files.js';
import { makeBackup, backupFileName, parseBackup } from '../backup.js';
import { pickFile, deliverFile } from '../files.js';
import { APP_VERSION, APP_BUILT } from '../version.js';

export function savedView() {
  const team = currentTeam(store.state);
  const games = teamGames(store.state, team.id).filter((g) => g.lineup);
  const ahead = upcomingGames(store.state, team.id).filter((g) => !g.lineup);
  const scheduled = store.state.games.filter((g) => g.teamId === team.id && g.scheduleKey).length;

  const duplicate = (g) => {
    const copy = { ...newGame(store.state, team), opponent: g.opponent, homeAway: g.homeAway, attending: [...g.attending], callUps: structuredClone(g.callUps) };
    store.commit((s) => { s.games.push(copy); });
    go(`#/game/${copy.id}/setup`);
  };
  const remove = async (g) => {
    if (!(await confirmDialog('Delete this saved lineup?', 'Delete', { danger: true }))) return;
    store.commit((s) => deleteGame(s, g.id));
    rerender();
  };

  const node = h('div', {},
    header({ title: 'Games', sub: `${team.name} · ${games.length} lineup${games.length === 1 ? '' : 's'}${ahead.length ? ` · ${ahead.length} coming up` : ''}` }),
    h('main', { class: 'page' },
      upcomingList(ahead, 'Schedule: lineup not built yet'),
      h('section', { class: 'card', style: 'display:flex;flex-direction:column;gap:8px' },
        h('div', { class: 'label' }, 'League schedule'),
        h('span', { class: 'muted' }, scheduled
          ? `${scheduled} games loaded${team.scheduleName ? ` for ${team.scheduleName}` : ''}. Load a newer file any time: dates and opponents update, and lineups you made are kept.`
          : "Load your division's schedule (the convenor's Excel file) and every game is set up for you. Then just mark who's here."),
        h('button', { class: 'btn', onclick: loadSchedule, 'data-test': 'load-schedule' }, icon('doc'), scheduled ? 'Load a newer schedule' : 'Load schedule from Excel')),
      games.length ? gamesList(team, games, 'Lineups') : h('div', { class: 'card empty' }, 'No saved lineups yet. Build one from Home.'),
      games.length ? h('section', { class: 'card flush' },
        h('div', { class: 'label', style: 'padding:12px 14px 2px' }, 'Manage'),
        games.map((g) => h('div', { class: 'row' },
          h('span', { class: 'grow' }, h('span', { class: 'title' }, `${g.gameNo ? `Game ${g.gameNo} · ` : ''}${g.opponent || 'Opponent'}`)),
          h('button', { class: 'btn', style: 'min-height:40px', onclick: () => duplicate(g) }, 'Reuse'),
          h('button', { class: 'icon-btn', 'aria-label': 'Delete', onclick: () => remove(g) }, icon('trash'))))) : null));
  return { node, nav: 'saved' };
}

// Interim: the coach loads the schedule file. In stage 4 the convenor publishes it with the league sync.
export async function loadSchedule() {
  const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!file) return;
  let schedule;
  try {
    toast('Reading the schedule…');
    schedule = await parseScheduleWorkbook(await loadExcel(), await file.arrayBuffer());
  } catch (e) {
    toast(/zip|central directory|signature/i.test(e.message) ? "That file isn't an Excel (.xlsx) file. Ask your convenor for the Excel version." : e.message);
    return;
  }
  if (!schedule.teams.length) { toast(schedule.problems[0] || 'No games found in that file.'); return; }
  showSchedulePicker(schedule);
}

export function showSchedulePicker(schedule) {
  const team = currentTeam(store.state);
  let pick = matchTeam(schedule.teams, team.scheduleName || team.name) || '';
  const tbd = schedule.games.filter((g) => g.tbd).length;
  const summary = h('p', { style: 'margin:0', 'data-test': 'schedule-summary' });
  const go1 = h('button', { class: 'btn primary big-btn', 'data-test': 'schedule-apply' });
  const refresh = () => {
    const rows = pick ? teamSchedule(schedule, pick) : [];
    const home = rows.filter((r) => r.homeAway === 'home').length;
    summary.textContent = pick
      ? `${rows.length} games for ${pick}: ${home} home, ${rows.length - home} visitor, ${formatDate(rows[0]?.date)} to ${formatDate(rows.at(-1)?.date)}.`
      : `Which team is ${team.name}?`;
    go1.textContent = pick ? `Add ${rows.length} games to ${team.name}` : 'Pick your team';
    go1.disabled = !pick;
  };
  openSheet('League schedule', (close) => {
    go1.onclick = () => {
      let r;
      store.commit((s) => { r = applySchedule(s, team, schedule, pick); });
      close();
      const parts = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`, r.kept && `${r.kept} kept (lineup made)`].filter(Boolean);
      toast(parts.length ? `Schedule loaded: ${parts.join(', ')}` : 'Schedule already up to date');
      rerender();
    };
    refresh();
    return [
      h('p', { class: 'muted', style: 'margin:0' }, `Found ${schedule.games.length - tbd} games for ${schedule.teams.length} teams.`),
      selectField('YOUR TEAM IN THE SCHEDULE', [{ value: '', label: 'Pick a team' }, ...schedule.teams], pick, (v) => { pick = v; refresh(); }, { test: 'schedule-team' }),
      summary,
      tbd ? h('p', { class: 'muted', style: 'margin:0' }, `${tbd} playoff game${tbd === 1 ? '' : 's'} with matchups not set yet ${tbd === 1 ? 'is' : 'are'} left out. Add ${tbd === 1 ? 'it' : 'them'} from Home when you know the opponent.`) : null,
      schedule.problems.length ? h('p', { class: 'muted', style: 'margin:0' }, `${schedule.problems.length} row${schedule.problems.length === 1 ? '' : 's'} skipped (missing date or team).`) : null,
      go1,
    ];
  });
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
