import { h, header, icon, toast, openSheet, segmented, selectField } from '../ui.js';
import { store } from '../store.js';
import { validateLineup } from '../../engine/index.js';
import { go, rerender } from '../main.js';
import {
  activePlayers, gamePlayers, generateFor, check, inningsCount, presentIn, spotsFor, swapCell, toggleLock, isLocked,
  midGameChange, summaryRows, displayShort, fullName, gameTitle, formatDate, cellClass, SIT, getDivision,
} from '../model.js';

const editing = new Set();      // game ids in edit mode
const undoStacks = new Map();   // game id -> previous lineups

function load(id) {
  const game = store.state.games.find((g) => g.id === id);
  const team = game && store.state.teams.find((t) => t.id === game.teamId);
  return { game, team };
}

function save(id, fn, { undo = true } = {}) {
  store.commit((s) => {
    const g = s.games.find((x) => x.id === id);
    if (undo && g.lineup) {
      const st = undoStacks.get(id) || [];
      st.push({ lineup: structuredClone(g.lineup), locks: structuredClone(g.locks || []), availability: structuredClone(g.availability || {}), attending: [...g.attending] });
      undoStacks.set(id, st.slice(-30));
    }
    fn(g);
    g.updatedAt = Date.now();
  });
}

export function lineupView(id) {
  const { game, team } = load(id);
  if (!game || !team) { go('#/home'); return null; }
  if (!game.lineup) { go(`#/game/${id}/setup`); return null; }
  const T = inningsCount(team);
  const players = gamePlayers(team, game);
  const byId = new Map(players.map((p) => [p.id, p]));
  const res = check(team, game);
  const edit = editing.has(id);
  const flagged = new Set();
  // highlight only the cell(s) that broke the rule, not everyone mentioned in the message
  for (const e of res.errors) {
    const pid = e.players?.[0];
    if (!e.inning || pid == null) continue;
    flagged.add(`${e.inning - 1}:${pid}`);
    if (e.rule === '4.1') flagged.add(`${e.inning - 2}:${pid}`);
  }

  // ---- banner ----
  const div = getDivision(team.division);
  const banner = res.ok
    ? h('div', { class: 'banner good', 'data-test': 'fairplay-ok' }, icon('shieldOk'),
      h('div', { class: 'grow' }, h('strong', {}, 'Fair play ✓ All rules met'),
        h('span', { style: 'font-size:13px;color:#24563A' }, okSummary(div))))
    : h('div', { class: 'banner bad', 'data-test': 'fairplay-bad' }, icon('alert'),
      h('div', { class: 'grow' },
        h('strong', {}, `${res.errors.length} fair play issue${res.errors.length === 1 ? '' : 's'}`),
        res.errors.slice(0, 4).map((e) => h('span', { class: 'issue' }, ruleTag(e.rule), e.message)),
        res.errors.length > 4 ? h('span', { class: 'issue' }, `+ ${res.errors.length - 4} more`) : null,
        h('span', { class: 'issue', style: 'color:var(--muted);font-size:13px' }, 'Tap Fix for me, or edit the highlighted cells. You can keep it, but it will need Convenor approval.')));
  const warnings = res.warnings;
  const warnBanner = warnings.length ? h('div', { class: 'banner warn' }, icon('alert'),
    h('div', { class: 'grow' }, h('strong', {}, `${warnings.length} thing${warnings.length === 1 ? '' : 's'} to check`),
      warnings.slice(0, 3).map((w) => h('span', { class: 'issue' }, w.message)),
      warnings.length > 3 ? h('span', { class: 'issue' }, `+ ${warnings.length - 3} more`) : null)) : null;

  // ---- grid ----
  const head = h('tr', {}, h('th', {}, '#'), h('th', { class: 'batter' }, 'BATTER'),
    Array.from({ length: T }, (_, k) => h('th', {}, String(k + 1))));
  const rows = game.lineup.battingOrder.filter((pid) => byId.has(pid)).map((pid, i) => {
    const p = byId.get(pid);
    const rowFlag = [...flagged].some((f) => f.endsWith(`:${pid}`));
    return h('tr', { class: rowFlag ? 'flag' : '' },
      h('td', { class: 'slot' }, String(i + 1)),
      h('td', { class: 'who' }, h('span', { class: 'n' }, p.jersey || ''), displayShort(p), p.callUp ? h('span', { class: 'muted', style: 'font-size:11px' }, ' (CU)') : null),
      Array.from({ length: T }, (_, k) => {
        const pos = game.lineup.innings[k]?.[pid];
        const cls = `cell ${cellClass(pos)}${flagged.has(`${k}:${pid}`) ? ' flag' : ''}`;
        const label = pos == null ? '–' : pos;
        const lock = isLocked(game, k, pid) ? h('span', { class: 'lock' }, icon('lock')) : null;
        const td = h('td', {});
        if (edit && pos != null) td.append(h('button', { class: cls, 'aria-label': `${fullName(p)}, inning ${k + 1}: ${label}. Change`, 'data-cell': `${k}:${pid}`, onclick: () => cellSheet(id, k, pid) }, label, lock));
        else td.append(h('span', { class: cls, 'aria-label': `${fullName(p)}, inning ${k + 1}: ${label}` }, label, lock));
        return td;
      }));
  });

  const options = game.options?.length > 1 ? segmented(game.options.map((_, i) => ({ value: i, label: `Option ${i + 1}` })), game.optionIndex,
    (i) => { save(id, (g) => { g.optionIndex = i; g.lineup = structuredClone(g.options[i]); }, { undo: false }); rerender(); }, 'Lineup options') : null;

  const shuffle = () => {
    const r = generateFor(store.state, team, game, { keepBatting: true });
    if (!r.ok) { toast(r.message); return; }
    save(id, (g) => { g.lineup = r.lineup; g.options = []; });
    toast('New positions'); rerender();
  };
  const threeOptions = () => {
    const r = generateFor(store.state, team, game, { keepBatting: true, options: 3 });
    if (!r.ok) { toast(r.message); return; }
    save(id, (g) => { g.options = r.lineups; g.optionIndex = 0; g.lineup = structuredClone(r.lineups[0]); });
    toast(r.lineups.length > 1 ? `${r.lineups.length} options to compare` : 'Only one good option with these settings'); rerender();
  };
  const fix = () => {
    const r = generateFor(store.state, team, game, { keepBatting: true });
    if (!r.ok) { toast('No fix keeps all your locked cells. Unlock a cell and try again.'); return; }
    save(id, (g) => { g.lineup = r.lineup; g.options = []; });
    toast('Fixed: locked cells kept'); rerender();
  };
  const undo = () => {
    const st = undoStacks.get(id) || [];
    const prev = st.pop();
    if (!prev) { toast('Nothing to undo'); return; }
    store.commit((s) => { const g = s.games.find((x) => x.id === id); Object.assign(g, prev, { options: [] }); });
    rerender();
  };

  const node = h('div', {},
    header({
      title: gameTitle(game),
      sub: `${game.gameNo ? `Game ${game.gameNo} · ` : ''}${formatDate(game.date)} · ${game.homeAway === 'away' ? 'Visitor' : 'Home'} · ${team.division} HL · ${players.length} players`,
      back: '#/home',
      right: h('a', { class: 'icon-btn', href: `#/game/${id}/setup`, 'aria-label': 'Game setup' }, icon('settings')),
    }),
    h('main', { class: 'page' },
      banner, warnBanner,
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', onclick: shuffle, 'data-test': 'shuffle' }, icon('shuffle'), 'Shuffle'),
        h('button', { class: 'btn', onclick: threeOptions, 'data-test': 'options' }, icon('options'), '3 options'),
        h('button', { class: 'btn', 'aria-pressed': String(edit), 'data-test': 'edit', onclick: () => { if (edit) editing.delete(id); else editing.add(id); rerender(); } }, icon('edit'), edit ? 'Done' : 'Edit')),
      options,
      edit ? h('div', { class: 'toolbar' },
        h('button', { class: 'btn', onclick: () => battingSheet(id) }, 'Batting order'),
        h('button', { class: 'btn', onclick: () => changeSheet(id), 'data-test': 'gameday' }, icon('clock'), 'Game-day change')) : null,
      edit ? h('div', { class: 'toolbar' },
        h('button', { class: 'btn', onclick: undo, 'data-test': 'undo' }, icon('undo'), 'Undo'),
        h('button', { class: 'btn', onclick: fix, disabled: res.ok, 'data-test': 'fix' }, icon('wand'), 'Fix for me')) : null,
      edit ? h('p', { class: 'muted', style: 'margin:0' }, 'Tap a cell to change it or lock it. Locked cells stay put when you Shuffle or Fix.') : null,
      h('div', { class: 'grid-wrap' }, h('table', { class: 'lineup', 'data-test': 'grid' }, h('thead', {}, head), h('tbody', {}, rows))),
      h('div', { class: 'legend' },
        h('span', {}, h('i', { style: 'background:var(--inf-bg)' }), 'Infield'),
        h('span', {}, h('i', { style: 'background:var(--of-bg)' }), 'Outfield'),
        h('span', {}, h('i', { style: 'background:var(--c-bg)' }), 'Catcher'),
        h('span', {}, h('i', { style: 'background:var(--sit-bg)' }), 'Sits')),
      h('div', { class: 'footer-bar' },
        h('a', { class: 'btn', href: `#/game/${id}/summary` }, 'Player summary'),
        h('button', { class: 'btn primary', onclick: () => toast('Score sheet PDF arrives in the next build stage') }, 'Score sheet PDF'))));
  return { node, nav: 'lineup', keepScroll: true };
}

function okSummary(div) {
  const bits = ['Bench time even', 'outfield rule met'];
  bits.push(`max ${div.catchMax} catching`);
  if (div.playerPitching) bits.push(`pitching ≤ ${div.pitchMax}, back-to-back`);
  return bits.join(' · ');
}

function ruleTag(rule) {
  const label = /^4\.\d$/.test(rule) ? rule : { catch: 'C', pitch: 'P', combo: 'C+P', catchers: 'C', structure: '!', batting: 'Bat' }[rule] || '!';
  return h('b', {}, `${label} `);
}

// ---- cell editor ----
function cellSheet(id, k, pid) {
  const { game, team } = load(id);
  const players = gamePlayers(team, game);
  const byId = new Map(players.map((p) => [p.id, p]));
  const row = game.lineup.innings[k];
  const cur = row[pid];
  const holder = (pos) => Object.keys(row).find((x) => row[x] === pos);
  const sitters = presentIn(team, game, k).filter((p) => row[p.id] === SIT && p.id !== pid);
  // would this swap leave the lineup fully compliant? (shown in green)
  const safe = (pos, withId) => validateLineup({ division: team.division, players, lineup: swapCell(game.lineup, k, pid, pos, withId) }).ok;
  const apply = (pos, withId) => (close) => {
    save(id, (g) => { g.lineup = swapCell(g.lineup, k, pid, pos, withId); g.options = []; });
    close(); rerender();
  };
  openSheet(`${displayShort(byId.get(pid))} · Inning ${k + 1}`, (close) => [
    h('span', { class: 'muted' }, `Now: ${cur === SIT ? 'sitting' : cur}. Tap a spot to swap with whoever has it. Green = swaps that keep every rule.`),
    h('div', { class: 'pos-grid' },
      spotsFor(team, game, k).map((pos) => {
        const who = holder(pos);
        return h('button', { class: `pos-btn${pos === cur ? ' current' : safe(pos) ? ' safe' : ''}`, 'data-pos': pos, onclick: pos === cur ? close : () => apply(pos)(close) },
          h('b', {}, pos), h('small', {}, who && who !== pid ? displayShort(byId.get(who) || { first: '?' }) : pos === cur ? 'current' : ''));
      }),
      cur === SIT ? null : sitters.map((s) => h('button', { class: `pos-btn sit${safe(SIT, s.id) ? ' safe' : ''}`, 'data-pos': 'SIT', onclick: () => apply(SIT, s.id)(close) },
        h('b', {}, 'SIT'), h('small', {}, `swap ${displayShort(s)}`)))),
    h('label', { class: 'switch-row' }, `Lock ${displayShort(byId.get(pid))} at ${cur} in inning ${k + 1}`,
      h('input', { type: 'checkbox', checked: isLocked(game, k, pid), 'data-test': 'lock', onchange: () => {
        save(id, (g) => { g.locks = toggleLock(g, k, pid); }, { undo: false });
        close(); rerender();
      } })),
  ]);
}

// ---- batting order ----
function battingSheet(id) {
  const { game, team } = load(id);
  const byId = new Map(gamePlayers(team, game).map((p) => [p.id, p]));
  let order = game.lineup.battingOrder.filter((x) => byId.has(x));
  const list = h('div', {});
  const draw = () => list.replaceChildren(...order.map((pid, i) => h('div', { class: 'order-row' },
    h('span', { class: 'slot' }, String(i + 1)),
    h('span', { class: 'nm' }, `#${byId.get(pid).jersey || '–'} ${displayShort(byId.get(pid))}`),
    h('button', { class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, icon('up')),
    h('button', { class: 'icon-btn', 'aria-label': 'Move down', disabled: i === order.length - 1, onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, icon('down')))));
  draw();
  openSheet('Batting order', (close) => [
    h('span', { class: 'muted' }, 'Move players up or down. Everyone bats, in this order.'),
    list,
    h('button', { class: 'btn primary big-btn', onclick: () => { save(id, (g) => { g.lineup = { ...g.lineup, battingOrder: order }; }); close(); rerender(); } }, 'Save order'),
  ]);
}

// ---- game-day change (late arrival / leaving early) ----
function changeSheet(id) {
  const { game, team } = load(id);
  const T = inningsCount(team);
  const present = gamePlayers(team, game);
  const notHere = activePlayers(team).filter((p) => !game.attending.includes(p.id));
  const state = { type: notHere.length ? 'arrive' : 'leave', playerId: '', inning: 2 };
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const draw = () => {
    const pool = state.type === 'arrive' ? [...notHere, ...present.filter((p) => (p.availableFrom ?? 0) > 0)] : present.filter((p) => p.availableUntil == null || p.availableUntil >= T);
    if (!pool.some((p) => p.id === state.playerId)) state.playerId = pool[0]?.id || '';
    const innings = state.type === 'arrive' ? Array.from({ length: T - 1 }, (_, i) => i + 2) : Array.from({ length: T - 1 }, (_, i) => i + 1);
    if (!innings.includes(state.inning)) state.inning = innings[0];
    body.replaceChildren(
      segmented([{ value: 'arrive', label: 'Arrived late' }, { value: 'leave', label: 'Leaving early' }], state.type, (v) => { state.type = v; draw(); }, 'Change type'),
      pool.length ? selectField('PLAYER', pool.map((p) => ({ value: p.id, label: `#${p.jersey || '–'} ${fullName(p)}` })), state.playerId, (v) => { state.playerId = v; })
        : h('p', { class: 'muted' }, state.type === 'arrive' ? 'Everyone on the roster is already in the lineup.' : 'Nobody to remove.'),
      selectField(state.type === 'arrive' ? 'PLAYS FROM INNING' : 'LEAVES AFTER INNING', innings.map((n) => ({ value: String(n), label: `Inning ${n}` })), String(state.inning), (v) => { state.inning = Number(v); }),
      h('p', { class: 'muted', style: 'margin:0' }, state.type === 'arrive'
        ? 'Innings already played stay as they are. The player bats last (rule 3.2.6) and the rest of the game is rebuilt.'
        : 'Innings already played stay as they are; the rest of the game is rebuilt without them.'));
  };
  draw();
  openSheet('Game-day change', (close) => [body,
    h('button', { class: 'btn primary big-btn', 'data-test': 'apply-change', onclick: () => {
      if (!state.playerId) { close(); return; }
      const fresh = load(id);
      const r = midGameChange(store.state, fresh.team, fresh.game, state);
      if (!r.ok) { toast(r.message); return; }
      save(id, (g) => { Object.assign(g, r.game); });
      close(); toast('Rest of the game rebuilt'); rerender();
    } }, 'Rebuild the rest of the game')]);
}

// ---- player summary ----
export function summaryView(id) {
  const { game, team } = load(id);
  if (!game?.lineup) { go('#/home'); return null; }
  const div = getDivision(team.division);
  const rows = summaryRows(team, game, store.state);
  const hasPrev = rows.some((r) => r.last !== '–');
  const node = h('div', {},
    header({ title: 'Player summary', sub: `${gameTitle(game)} · ${inningsCount(team)} innings`, back: `#/game/${id}` }),
    h('main', { class: 'page' },
      hasPrev ? h('div', { class: 'banner', style: 'background:#EEF3FA;border-color:#C9D7EA;color:var(--ink)' }, icon('shuffle'),
        h('div', { class: 'grow' }, 'Batting order rotated from the last game: its bottom third bats first.')) : null,
      h('section', { class: 'card', style: 'padding:0 8px' },
        h('table', { class: 'summary' },
          h('thead', {}, h('tr', {}, ['PLAYER', 'BATS', hasPrev ? 'LAST' : null, 'SITS', 'INF', 'OF', 'C', div.playerPitching ? 'P' : null].filter(Boolean).map((t) => h('th', {}, t)))),
          h('tbody', {}, rows.map((r) => h('tr', {},
            h('td', { style: 'font-weight:600' }, r.name), h('td', { style: 'font-weight:700' }, String(r.slot)),
            hasPrev ? h('td', { class: 'muted' }, String(r.last)) : null,
            h('td', {}, String(r.sits)), h('td', {}, String(r.inf)), h('td', {}, String(r.of)), h('td', {}, String(r.c)),
            div.playerPitching ? h('td', {}, String(r.p)) : null))))),
      h('p', { class: 'muted', style: 'margin:0' }, `INF includes catcher and pitcher innings. ${team.division} limits: catch ${div.catchMax} max${div.rule43 ? '; 2 outfield innings each before anyone plays a 3rd' : ''}${div.playerPitching ? `; pitch ${div.pitchMax} max, back-to-back; catch + pitch ${div.comboMax} max` : ''}.`)));
  return { node, nav: 'lineup' };
}
