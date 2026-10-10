// CoachAssist entry point: loads saved data, routes between screens, draws the bottom nav.

import { store } from './store.js';
import { h, icon } from './ui.js';
import { currentTeam } from './model.js';
import { welcomeView, homeView } from './views/home.js';
import { rosterView, playerView } from './views/roster.js';
import { teamView } from './views/team.js';
import { gameSetupView } from './views/game.js';
import { lineupView, summaryView } from './views/lineup.js';
import { savedView, settingsView } from './views/saved.js';

const routes = [
  [/^#?\/?$/, () => (store.state.teams.length ? homeView() : welcomeView())],
  [/^#\/home$/, () => homeView()],
  [/^#\/roster$/, () => rosterView()],
  [/^#\/player\/([\w-]+)$/, (id) => playerView(id)],
  [/^#\/team\/([\w-]+)$/, (id) => teamView(id)],
  [/^#\/game\/([\w-]+)\/setup$/, (id) => gameSetupView(id)],
  [/^#\/game\/([\w-]+)\/summary$/, (id) => summaryView(id)],
  [/^#\/game\/([\w-]+)$/, (id) => lineupView(id)],
  [/^#\/lineup$/, () => latestLineup()],
  [/^#\/saved$/, () => savedView()],
  [/^#\/settings$/, () => settingsView()],
];

const NAV = [
  ['home', '#/home', 'Home', 'home'],
  ['roster', '#/roster', 'Roster', 'roster'],
  ['lineup', '#/lineup', 'Lineup', 'lineup'],
  ['saved', '#/saved', 'Saved', 'saved'],
  ['settings', '#/settings', 'Settings', 'settings'],
];

function latestLineup() {
  const team = currentTeam(store.state);
  const g = team && store.state.games.filter((x) => x.teamId === team.id && x.lineup).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (g) { location.replace(`#/game/${g.id}`); return null; }
  return homeView({ notice: 'No lineup yet. Tap Build lineup to make one.' });
}

export function render() {
  const hash = location.hash || '#/';
  if (!store.state.teams.length && !/^#\/team\/new$/.test(hash) && hash !== '#/') { location.replace('#/'); return; }
  let view = null;
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) { view = fn(...m.slice(1)); break; }
  }
  if (view === null && hash !== '#/') return; // redirected
  if (!view) view = homeView();
  const app = document.getElementById('app');
  app.replaceChildren(view.node);
  app.classList.toggle('no-nav', !!view.noNav);
  drawNav(view.nav, !view.noNav);
  if (!view.keepScroll) window.scrollTo(0, 0);
}

export const rerender = () => {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
};

function drawNav(active, show) {
  const nav = document.getElementById('nav');
  nav.hidden = !show;
  if (!show) return;
  nav.replaceChildren(h('div', { class: 'inner' },
    NAV.map(([key, href, label, ic]) => h('a', { href, 'aria-current': key === active ? 'page' : null }, icon(ic), label))));
}

export function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

window.addEventListener('hashchange', render);
store.init().then(render);
