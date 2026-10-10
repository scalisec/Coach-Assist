// League schedule: read the convenor's schedule spreadsheet and turn it into games for one team.
// Columns follow the league's own export (Date, Day, Start time, End Time, Home team, Visitor team,
// Venue, Event, Week) but are found by heading, so extra or reordered columns are fine.
// ExcelJS is passed in (window.ExcelJS in the browser, require('exceljs') in tests).

import { activePlayers, uid } from './model.js';

const HEADS = {
  date: /^date$|game date/i,
  time: /start|^time$/i,
  home: /home/i,
  visitor: /visit|away/i,
  venue: /venue|diamond|field|park|location/i,
  event: /event|type|game\s*#|game no/i,
};

// "1st", "10th (RR)", "winner game 19", "TBD": playoff slots whose teams aren't known yet
const PLACEHOLDER = /^\d+(st|nd|rd|th)\b|winner|loser|\btbd\b|\btba\b|seed/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const pad = (n) => String(n).padStart(2, '0');

function text(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return text(v.result);
    if (v.text) return String(v.text).trim();
    return '';
  }
  return typeof v === 'number' ? v : String(v).trim();
}

/** Date cell → 'YYYY-MM-DD'. Handles Excel dates, serial numbers, 05/12/2026 (month first) and 2026-05-12. */
export function parseDate(v) {
  v = text(v);
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) return parseDate(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5));
  const s = String(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (Number(m[1]) <= 12) return `${y}-${pad(m[1])}-${pad(m[2])}`;
    return `${y}-${pad(m[2])}-${pad(m[1])}`; // 25/05/2026: day first
  }
  return '';
}

/** Time cell → 'HH:MM' (24h). Handles Excel times, fractions of a day, "6:15pm", "18:15". */
export function parseTime(v) {
  v = text(v);
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) { const mins = Math.round(v * 1440); return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; }
  const m = String(v).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/);
  if (!m) return '';
  let hr = Number(m[1]);
  const ap = m[3]?.[0];
  if (ap === 'p' && hr < 12) hr += 12;
  if (ap === 'a' && hr === 12) hr = 0;
  if (hr > 23) return '';
  return `${pad(hr)}:${m[2] || '00'}`;
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [hr, mi] = hhmm.split(':').map(Number);
  return `${((hr + 11) % 12) + 1}:${pad(mi)} ${hr < 12 ? 'AM' : 'PM'}`;
}

/**
 * Rows (arrays of cell values) → schedule.
 * @returns {{games:Array<{date,time,home,visitor,venue,event,tbd}>, teams:string[], problems:string[]}}
 */
export function parseScheduleRows(rows) {
  const problems = [];
  const hi = rows.findIndex((r) => {
    const cells = (r || []).map((c) => String(text(c) || ''));
    return cells.some((c) => HEADS.date.test(c)) && cells.some((c) => HEADS.home.test(c)) && cells.some((c) => HEADS.visitor.test(c));
  });
  if (hi < 0) return { games: [], teams: [], problems: ["Couldn't find the heading row (Date, Home team, Visitor team)."] };
  const head = rows[hi].map((c) => String(text(c) || ''));
  const col = {};
  for (const [k, re] of Object.entries(HEADS)) {
    const i = head.findIndex((c, j) => re.test(c) && !Object.values(col).includes(j));
    if (i >= 0) col[k] = i;
  }
  const games = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (k) => (col[k] == null ? '' : row[col[k]]);
    const home = String(text(get('home')) || '').trim();
    const visitor = String(text(get('visitor')) || '').trim();
    const date = parseDate(get('date'));
    if (!home && !visitor && !date) continue;
    if (!date || !home || !visitor) {
      if (date || home || visitor) problems.push(`Row ${r + 1} skipped: missing ${!date ? 'date' : !home ? 'home team' : 'visitor team'}.`);
      continue;
    }
    games.push({
      date, time: parseTime(get('time')), home, visitor,
      venue: String(text(get('venue')) || '').trim(),
      event: String(text(get('event')) || '').trim(),
      tbd: PLACEHOLDER.test(home) || PLACEHOLDER.test(visitor),
    });
  }
  games.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const teams = [...new Set(games.filter((g) => !g.tbd).flatMap((g) => [g.home, g.visitor]))].sort((a, b) => a.localeCompare(b));
  if (!games.length) problems.push('No games found under the heading row.');
  return { games, teams, problems };
}

/** Reads the "Schedule" tab if there is one, else the first tab with a schedule heading row. */
export async function parseScheduleWorkbook(ExcelJS, buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = [...wb.worksheets].sort((a, b) => (/schedule/i.test(b.name) ? 1 : 0) - (/schedule/i.test(a.name) ? 1 : 0));
  let last = null;
  for (const ws of sheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => { rows[n - 1] = (row.values || []).slice(1); });
    const res = parseScheduleRows(rows);
    if (res.games.length) return res;
    last = res;
  }
  return last || { games: [], teams: [], problems: ['The file has no sheets.'] };
}

/** Which schedule team is this one? Exact name first, then one name containing the other. */
export function matchTeam(teams, name) {
  const n = norm(name);
  if (!n) return null;
  return teams.find((t) => norm(t) === n) || teams.find((t) => norm(t) && (n.includes(norm(t)) || norm(t).includes(n))) || null;
}

const keyOf = (g) => `${g.date}|${norm(g.home)}|${norm(g.visitor)}`;

/** The schedule games for one team, numbered 1, 2, 3… in date order. */
export function teamSchedule(schedule, scheduleName) {
  const n = norm(scheduleName);
  return schedule.games.filter((g) => !g.tbd && (norm(g.home) === n || norm(g.visitor) === n)).map((g, i) => ({
    key: keyOf(g), date: g.date, time: g.time, venue: g.venue, gameNo: String(i + 1),
    homeAway: norm(g.home) === n ? 'home' : 'away',
    opponent: norm(g.home) === n ? g.visitor : g.home,
  }));
}

/**
 * Adds the team's games to the saved state (call inside store.commit). Running it again with a
 * newer schedule updates dates, times and opponents; games that dropped off the schedule are
 * removed unless a lineup was already made for them. The team's opponent list becomes the
 * schedule's teams.
 * @returns {{added:number, updated:number, removed:number, kept:number}}
 */
export function applySchedule(state, team, schedule, scheduleName) {
  const rows = teamSchedule(schedule, scheduleName);
  const keys = new Set(rows.map((r) => r.key));
  const mine = state.games.filter((g) => g.teamId === team.id && g.scheduleKey);
  let added = 0, updated = 0, removed = 0, kept = 0;
  for (const r of rows) {
    const g = mine.find((x) => x.scheduleKey === r.key);
    const fields = { date: r.date, time: r.time, venue: r.venue, opponent: r.opponent, homeAway: r.homeAway, gameNo: r.gameNo };
    if (g) {
      if (Object.entries(fields).some(([k, v]) => g[k] !== v)) { Object.assign(g, fields, { updatedAt: Date.now() }); updated++; }
    } else {
      state.games.push({
        id: uid('g'), teamId: team.id, createdAt: Date.now(), updatedAt: Date.now(), ...fields, scheduleKey: r.key,
        attending: activePlayers(team).map((p) => p.id), attendanceSet: false, callUps: [], availability: {},
        lineup: null, locks: [], options: [], optionIndex: 0, seed: null,
      });
      added++;
    }
  }
  for (const g of mine) {
    if (keys.has(g.scheduleKey)) continue;
    if (g.lineup) { kept++; continue; }
    state.games.splice(state.games.indexOf(g), 1);
    removed++;
  }
  const t = state.teams.find((x) => x.id === team.id);
  t.scheduleName = scheduleName;
  // the league schedule is the source of truth for the opponent list
  t.divisionTeams = schedule.teams.filter((x) => norm(x) !== norm(scheduleName));
  return { added, updated, removed, kept };
}
