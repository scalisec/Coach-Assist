// App data model: pure functions over the saved state, shared by the screens and tested in Node.

import { generateLineup, validateLineup, getDivision, fieldPositions, isOutfield, SIT, DIVISIONS } from '../engine/index.js';

export const DIVISION_CODES = Object.keys(DIVISIONS);
export const ALL_POSITIONS = ['C', 'P', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'CF', 'RCF', 'RF'];

export const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function newTeam(fields = {}) {
  return { id: uid('t'), name: '', division: '8U', teamNo: '', headCoach: '', coaches: ['', ''], divisionTeams: [], players: [], ...fields };
}

export function newPlayer(fields = {}) {
  return { id: uid('p'), jersey: '', first: '', last: '', cantPlay: [], preferred: [], canPitch: false, canCatch: false, active: true, ...fields };
}

export function sampleTeam() {
  const names = [['Sam', 'Rivera', 7], ['Ava', 'Lee', 12], ['Leo', 'Martin', 3], ['Noah', 'Khan', 21], ['Mia', 'Tran', 9], ['Eli', 'Park', 5],
    ['Zoe', 'Chen', 14], ['Max', 'Diaz', 2], ['Liam', 'Hall', 18], ['Owen', 'Shah', 10], ['Ty', 'Brown', 4], ['Jack', 'Wong', 16]];
  return newTeam({
    name: 'Expos', division: '8U', headCoach: 'Sample Coach',
    divisionTeams: ['Blue Jays', 'Cubs', 'Rockies', 'Tigers'],
    players: names.map(([first, last, jersey], i) => newPlayer({
      first, last, jersey: String(jersey),
      cantPlay: first === 'Max' ? ['C'] : [],
      preferred: first === 'Sam' ? ['SS', '2B'] : first === 'Ty' ? ['P'] : [],
      canPitch: i < 6, canCatch: i % 2 === 0,
    })),
  });
}

export const activePlayers = (team) => (team?.players || []).filter((p) => p.active !== false)
  .sort((a, b) => (Number(a.jersey) || 999) - (Number(b.jersey) || 999));

export const currentTeam = (state) => state.teams.find((t) => t.id === state.currentTeamId) || state.teams[0] || null;
export const teamGames = (state, teamId) => state.games.filter((g) => g.teamId === teamId)
  .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);

export function newGame(state, team) {
  const games = teamGames(state, team.id);
  const nums = games.map((g) => Number(g.gameNo) || 0);
  return {
    id: uid('g'), teamId: team.id, createdAt: Date.now(), updatedAt: Date.now(),
    date: new Date().toISOString().slice(0, 10), opponent: '', homeAway: 'home',
    gameNo: String((nums.length ? Math.max(...nums) : 0) + 1),
    attending: activePlayers(team).map((p) => p.id), callUps: [], availability: {},
    lineup: null, locks: [], options: [], optionIndex: 0, seed: null,
  };
}

// The players the engine sees for a game: attending roster players plus call-ups,
// with late arrivals / early departures applied.
export function gamePlayers(team, game) {
  const roster = activePlayers(team).filter((p) => game.attending.includes(p.id));
  const all = [...roster, ...(game.callUps || []).map((c) => ({ ...c, callUp: true }))];
  return all.map((p) => {
    const a = game.availability?.[p.id] || {};
    return { ...p, availableFrom: a.from ?? 0, availableUntil: a.until };
  });
}

export function previousBattingOrder(state, game) {
  const prior = teamGames(state, game.teamId).filter((g) => g.id !== game.id && g.lineup &&
    ((g.date || '') < (game.date || '') || ((g.date || '') === (game.date || '') && g.createdAt < game.createdAt)));
  return prior[0]?.lineup.battingOrder;
}

export function generateFor(state, team, game, { seed = Date.now(), options = 1, keepBatting = false } = {}) {
  const players = gamePlayers(team, game);
  return generateLineup({
    division: team.division, players, seed, options,
    locks: game.locks,
    battingOrder: keepBatting && game.lineup ? game.lineup.battingOrder : undefined,
    previousBattingOrder: previousBattingOrder(state, game),
  });
}

export function check(team, game) {
  if (!game.lineup) return null;
  return validateLineup({ division: team.division, players: gamePlayers(team, game), lineup: game.lineup });
}

export function inningsCount(team) { return getDivision(team.division).innings; }

export function presentIn(team, game, k) {
  const T = inningsCount(team);
  return gamePlayers(team, game).filter((p) => k >= (p.availableFrom ?? 0) && k < (p.availableUntil ?? T));
}

export function spotsFor(team, game, k) {
  return fieldPositions(getDivision(team.division), presentIn(team, game, k).length);
}

// Move player `id` to `pos` in inning k. Whoever held that spot takes id's old spot.
// For the bench, `withId` names which benched player swaps in.
export function swapCell(lineup, k, id, pos, withId) {
  const row = { ...lineup.innings[k] };
  const old = row[id];
  let other = withId;
  if (other == null && pos !== SIT) other = Object.keys(row).find((x) => row[x] === pos && x !== String(id));
  if (other != null && other !== String(id)) row[other] = old;
  row[id] = pos;
  const innings = lineup.innings.map((r, i) => (i === k ? row : r));
  return { ...lineup, innings };
}

export function toggleLock(game, k, id) {
  const locks = Array.from({ length: Math.max(game.locks?.length || 0, k + 1) }, (_, i) => ({ ...(game.locks?.[i] || {}) }));
  if (locks[k][id] != null) delete locks[k][id];
  else locks[k][id] = game.lineup.innings[k][id];
  return locks;
}

export const isLocked = (game, k, id) => game.locks?.[k]?.[id] != null;

// Mid-game: a player arrives for inning `inning` (1-based) or leaves after inning `inning`.
// Completed innings are locked whole; the rest is rebuilt.
export function midGameChange(state, team, game, { playerId, type, inning }) {
  const g = structuredClone(game);
  g.availability = { ...(g.availability || {}) };
  let doneThrough; // innings fully played (count)
  if (type === 'arrive') {
    g.availability[playerId] = { ...(g.availability[playerId] || {}), from: inning - 1 };
    if (!g.attending.includes(playerId) && !g.callUps.some((c) => c.id === playerId)) g.attending.push(playerId);
    if (!g.lineup.battingOrder.includes(playerId)) g.lineup.battingOrder = [...g.lineup.battingOrder, playerId]; // 3.2.6
    doneThrough = inning - 1;
  } else {
    g.availability[playerId] = { ...(g.availability[playerId] || {}), until: inning };
    doneThrough = inning;
  }
  // Lock innings already played. For an arrival, an inning is only locked if the player
  // wasn't in it (otherwise the plan for that inning didn't happen and is rebuilt).
  const locks = [];
  for (let k = 0; k < doneThrough; k++) {
    const row = g.lineup.innings[k];
    if (type === 'arrive' && row[playerId] != null) continue;
    locks[k] = { ...row };
  }
  for (let k = doneThrough; k < (g.locks?.length || 0); k++) {
    const l = { ...(g.locks[k] || {}) };
    delete l[playerId];
    locks[k] = l;
  }
  g.locks = locks;
  const res = generateFor(state, team, g, { keepBatting: true });
  if (!res.ok) return { ok: false, message: res.message };
  g.lineup = res.lineup;
  g.options = [];
  return { ok: true, game: g };
}

export function summaryRows(team, game, state) {
  const prev = previousBattingOrder(state, game) || [];
  const players = gamePlayers(team, game);
  const byId = new Map(players.map((p) => [p.id, p]));
  return game.lineup.battingOrder.filter((id) => byId.has(id)).map((id, i) => {
    const cells = game.lineup.innings.map((r) => r[id]).filter(Boolean);
    const lastIdx = prev.indexOf(id);
    return {
      id, name: displayShort(byId.get(id)), slot: i + 1, last: lastIdx >= 0 ? lastIdx + 1 : '–',
      sits: cells.filter((c) => c === SIT).length,
      inf: cells.filter((c) => c !== SIT && !isOutfield(c)).length,
      of: cells.filter((c) => isOutfield(c)).length,
      c: cells.filter((c) => c === 'C').length,
      p: cells.filter((c) => c === 'P').length,
    };
  });
}

// Everything the score sheet needs, in the order it is printed (rules 4.4, D11, D13).
export function scoreSheetData(team, game) {
  const players = gamePlayers(team, game);
  const byId = new Map(players.map((p) => [p.id, p]));
  const T = inningsCount(team);
  const res = check(team, game);
  const slots = game.lineup.battingOrder.filter((id) => byId.has(id)).map((id) => {
    const p = byId.get(id);
    const pos = Array.from({ length: 7 }, (_, k) => (k < T ? (game.lineup.innings[k]?.[id] ?? '') : ''));
    return { num: p.jersey || '', name: `${fullName(p)}${p.callUp ? ' (CU)' : ''}`, pos };
  });
  const opp = game.opponent || '';
  return {
    title: `${team.name} ${gameTitle(game)}${game.gameNo ? ` - Game ${game.gameNo}` : ''} - ${game.date || ''}`,
    division: `${team.division} HL`,
    team1: { no: team.teamNo || '', name: team.name },
    team2: { no: '', name: opp },
    home: game.homeAway !== 'away',
    gameNo: game.gameNo || '',
    date: game.date || '',
    headCoach: team.headCoach || '',
    coaches: (team.coaches || []).filter(Boolean),
    slots,
    compliant: !!res?.ok,
    footer: `Prepared with CoachAssist${res?.ok ? ' · fair play checked (BOMBA rules 4.1-4.3)' : ''}`,
  };
}

export function scoreSheetFileName(team, game) {
  const clean = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${clean(team.name)}-${game.homeAway === 'away' ? 'at' : 'vs'}-${clean(game.opponent || 'Opponent')}${game.gameNo ? `-Game${clean(game.gameNo)}` : ''}-${game.date || ''}.pdf`;
}

export const displayShort = (p) => [p.first, p.last ? `${p.last[0]}.` : ''].filter(Boolean).join(' ') || `#${p.jersey}`;
export const fullName = (p) => [p.first, p.last].filter(Boolean).join(' ');

export function gameTitle(game) {
  const vs = game.homeAway === 'away' ? 'at' : 'vs';
  return `${vs} ${game.opponent || 'Opponent'}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

export const cellClass = (pos) => (pos == null ? 'out' : pos === SIT ? 'sit' : pos === 'C' ? 'c' : isOutfield(pos) ? 'of' : 'inf');
export { SIT, isOutfield, getDivision };
