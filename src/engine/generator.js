// Lineup generator: builds many random lineups that obey the hard rules, scores them on
// softer goals, and returns the best. Every result is re-checked by the validator.
// See the Design Spec, "Lineup generator".

import { getDivision, fieldPositions, isOutfield, SIT } from './divisions.js';
import { displayName, isPresent, cantPlay, prefers } from './players.js';
import { makeRng } from './random.js';
import { rotateBattingOrder } from './batting.js';
import { validateLineup } from './validator.js';

/**
 * @param {object} args
 * @param {string} args.division
 * @param {Array}  args.players            roster for this game (attending players and call-ups)
 * @param {Array}  [args.locks]            per inning, {id: position} cells the coach pinned;
 *                                         completed innings in a mid-game rebuild are passed whole
 * @param {Array}  [args.battingOrder]     keep this batting order instead of making one
 * @param {Array}  [args.previousBattingOrder]  last game's order, for rotation (D9)
 * @param {number|string} [args.seed]
 * @param {number} [args.candidates=40]    valid lineups to collect before picking
 * @param {number} [args.maxAttempts=1500]
 * @param {number} [args.options=1]        how many distinct lineups to return (Options view)
 * @returns {{ok:true, lineup, lineups, score, seed} | {ok:false, reason, message}}
 */
export function generateLineup(args) {
  const div = getDivision(args.division);
  const players = args.players;
  const T = div.innings;
  const seed = args.seed ?? Date.now();
  const rng = makeRng(seed);
  const locks = normalizeLocks(args.locks, T);

  const pre = precheck(div, players, locks);
  if (pre) return { ok: false, ...pre };

  const battingOrder = args.battingOrder || rotateBattingOrder(
    players.filter((p) => (p.availableFrom ?? 0) === 0).map((p) => p.id),
    args.previousBattingOrder,
    { rng, lateIds: players.filter((p) => (p.availableFrom ?? 0) > 0).sort((a, b) => a.availableFrom - b.availableFrom).map((p) => p.id) },
  );

  const want = args.candidates ?? 40;
  const maxAttempts = args.maxAttempts ?? 1500;
  const found = [];
  const seen = new Set();
  let lastFailure = null;
  for (let attempt = 0; attempt < maxAttempts && found.length < want; attempt++) {
    const res = attemptOnce(div, players, locks, rng);
    if (!res.ok) { lastFailure = res.reason; continue; }
    const lineup = { battingOrder, innings: res.innings };
    const key = JSON.stringify(res.innings);
    if (seen.has(key)) continue;
    seen.add(key);
    const check = validateLineup({ division: div.code, players, lineup });
    if (!check.ok) { lastFailure = check.errors[0].message; continue; }
    found.push({ lineup, score: scoreLineup(div, players, res.innings) });
  }

  if (!found.length) {
    return {
      ok: false, reason: 'no-solution',
      message: "Couldn't find a lineup that meets every rule with these settings. Try removing a can't-play setting or a locked cell.",
      detail: lastFailure,
    };
  }
  found.sort((a, b) => b.score - a.score);
  const picks = pickDistinct(found, args.options ?? 1);
  return { ok: true, lineup: picks[0].lineup, score: picks[0].score, lineups: picks.map((f) => f.lineup), seed };
}

// ---------------------------------------------------------------------------

function normalizeLocks(locks, T) {
  const out = Array.from({ length: T }, () => ({}));
  (locks || []).forEach((row, k) => { if (row && k < T) Object.assign(out[k], row); });
  return out;
}

// Plain-language reasons a lineup can't exist, before trying.
function precheck(div, players, locks) {
  const T = div.innings;
  const atStart = players.filter((p) => isPresent(p, 0, T)).length;
  if (atStart < div.minStart) {
    return { reason: 'too-few', message: `${div.code} needs at least ${div.minStart} players to start; ${atStart} ${atStart === 1 ? 'is' : 'are'} here.` };
  }
  if (players.length > 15) return { reason: 'too-many', message: 'The score sheet holds 15 players; remove a player or call-up.' };

  const catchers = players.filter((p) => canCatchHere(div, p));
  if (catchers.length * div.catchMax < T) {
    const need = Math.ceil(T / div.catchMax);
    return { reason: 'catchers', message: `${div.code} needs at least ${need} players who can catch for ${T} innings (max ${div.catchMax} each); only ${catchers.length} can.` };
  }
  if (div.minCatchers && catchers.length < div.minCatchers) {
    return { reason: 'catchers', message: `${div.code} needs at least ${div.minCatchers} catchers; only ${catchers.length} player${catchers.length === 1 ? '' : 's'} can catch.` };
  }
  if (div.playerPitching) {
    const pitchers = players.filter((p) => canPitchHere(div, p));
    if (pitchers.length * div.pitchMax < T) {
      const need = Math.ceil(T / div.pitchMax);
      return { reason: 'pitchers', message: `${div.code} needs at least ${need} pitchers for ${T} innings (max ${div.pitchMax} each, call-ups can't pitch); only ${pitchers.length} ${pitchers.length === 1 ? 'is' : 'are'} marked "can pitch".` };
    }
  }
  return null;
}

const canCatchHere = (div, p) => !cantPlay(p, 'C') && (div.playerPitching ? !!p.canCatch : true);
const canPitchHere = (div, p) => !p.callUp && !cantPlay(p, 'P') && (div.playerPitching ? !!p.canPitch : true);

function attemptOnce(div, players, locks, rng) {
  const T = div.innings;
  const ids = players.map((p) => p.id);
  const byId = new Map(players.map((p) => [p.id, p]));
  const presentAt = (k) => players.filter((p) => isPresent(p, k, T));
  const lockedPos = (k, id) => locks[k][id];
  const holderOf = (k, pos) => Object.keys(locks[k]).find((id) => locks[k][id] === pos);
  const realId = (id) => (byId.has(id) ? id : Number(id));

  const catcher = new Array(T).fill(null);
  const pitcher = new Array(T).fill(null);
  const catches = new Map(ids.map((id) => [id, 0]));
  const pitches = new Map(ids.map((id) => [id, 0]));

  // 1) Bench schedule for the whole game: fewest sits first, never back-to-back (4.1, 4.2).
  //    Planned before catchers and pitchers so bench time stays even for everyone.
  const benched = Array.from({ length: T }, () => new Set());
  const sits = new Map(ids.map((id) => [id, 0]));
  for (let k = 0; k < T; k++) {
    const present = presentAt(k);
    const nSit = present.length - fieldPositions(div, present.length).length;
    for (const p of present) if (lockedPos(k, p.id) === SIT) benched[k].add(p.id);
    const need = nSit - benched[k].size;
    if (need < 0) return { ok: false, reason: 'locks' };
    if (need > 0) {
      const pool = rng.shuffle(present.filter((p) => lockedPos(k, p.id) == null && !(k > 0 && benched[k - 1].has(p.id))))
        .sort((a, b) => sits.get(a.id) - sits.get(b.id));
      if (pool.length < need) return { ok: false, reason: 'bench' };
      for (const p of pool.slice(0, need)) benched[k].add(p.id);
    }
    for (const id of benched[k]) sits.set(id, sits.get(id) + 1);
  }
  const free = (k, id) => !benched[k].has(id) && lockedPos(k, id) == null;

  // 2) Pitchers (players pitch in 11U and up): back-to-back blocks within the pitch max.
  if (div.playerPitching) {
    for (let k = 0; k < T; k++) {
      const locked = holderOf(k, 'P');
      let pick = locked != null ? realId(locked) : null;
      if (pick == null) {
        const prev = k > 0 ? pitcher[k - 1] : null;
        const prevP = prev != null ? byId.get(prev) : null;
        const canContinue = prevP && isPresent(prevP, k, T) && pitches.get(prev) < div.pitchMax && free(k, prev) &&
          comboLeft(div, prev, catches, pitches) > 0;
        // keep the same pitcher most of the time, so blocks fill out
        if (canContinue && rng.next() < 0.8) pick = prev;
        else {
          const pool = presentAt(k).filter((p) => canPitchHere(div, p) && pitches.get(p.id) === 0 && free(k, p.id) &&
            comboLeft(div, p.id, catches, pitches) > 0);
          if (pool.length) pick = rng.pick(pool).id;
          else if (canContinue) pick = prev;
          else return { ok: false, reason: 'pitchers' };
        }
      }
      pitcher[k] = pick;
      pitches.set(pick, pitches.get(pick) + 1);
    }
  }

  // 3) Catchers: within the catch max (and the combined max), back-to-back pairs where possible (A8).
  for (let k = 0; k < T; k++) {
    const locked = holderOf(k, 'C');
    let pick = locked != null ? realId(locked) : null;
    if (pick == null) {
      const ok = (p) => canCatchHere(div, p) && isPresent(p, k, T) && catches.get(p.id) < div.catchMax &&
        pitcher[k] !== p.id && free(k, p.id) && comboLeft(div, p.id, catches, pitches) > 0;
      const prev = k > 0 ? catcher[k - 1] : null;
      if (prev != null && ok(byId.get(prev)) && rng.next() < 0.7) pick = prev;
      else {
        let pool = presentAt(k).filter(ok);
        if (!pool.length) return { ok: false, reason: 'catchers' };
        const fewest = Math.min(...pool.map((p) => catches.get(p.id)));
        pool = pool.filter((p) => catches.get(p.id) === fewest);
        pick = rng.pick(pool).id;
      }
    }
    catcher[k] = pick;
    catches.set(pick, catches.get(pick) + 1);
  }

  // 4) Field positions, inning by inning.
  const innings = [];
  const ofs = new Map(ids.map((id) => [id, 0]));
  const infs = new Map(ids.map((id) => [id, 0]));
  for (let k = 0; k < T; k++) {
    const present = presentAt(k);
    const spots = fieldPositions(div, present.length);
    const row = {};
    for (const [id, pos] of Object.entries(locks[k])) row[realId(id)] = pos;
    for (const id of benched[k]) row[id] = SIT;
    if (catcher[k] != null) row[catcher[k]] = 'C';
    if (div.playerPitching && pitcher[k] != null) row[pitcher[k]] = 'P';

    // field: outfield to those with the fewest outfield innings (4.3), then match positions
    const taken = new Set(Object.values(row));
    const open = spots.filter((s) => !taken.has(s));
    const unplaced = present.filter((p) => row[p.id] == null);
    if (unplaced.length !== open.length) return { ok: false, reason: 'locks' };
    const openOF = open.filter(isOutfield);
    const openIF = open.filter((s) => !isOutfield(s));
    const noOF = (p) => openOF.every((s) => cantPlay(p, s)) ? 1 : 0; // can't play any open OF spot -> last
    const ofPool = rng.shuffle(unplaced).sort((a, b) =>
      noOF(a) - noOF(b) || ofs.get(a.id) - ofs.get(b.id) || infs.get(b.id) - infs.get(a.id));
    const ofGroup = ofPool.slice(0, openOF.length);
    const ifGroup = ofPool.slice(openOF.length);
    const prevRow = k > 0 ? innings[k - 1] : null;
    const a1 = assign(ifGroup, openIF, prevRow, rng);
    const a2 = assign(ofGroup, openOF, prevRow, rng);
    if (!a1 || !a2) return { ok: false, reason: 'restrictions' };
    Object.assign(row, a1, a2);

    for (const p of present) {
      const pos = row[p.id];
      if (pos === SIT) continue;
      if (isOutfield(pos)) ofs.set(p.id, ofs.get(p.id) + 1);
      else infs.set(p.id, infs.get(p.id) + 1);
    }
    innings.push(row);
  }
  return { ok: true, innings };
}

function comboLeft(div, id, catches, pitches) {
  return div.comboMax ? div.comboMax - catches.get(id) - pitches.get(id) : Infinity;
}

// Match players to positions: can't-play is a hard limit; preferred and "not the same
// spot as last inning" are tried first.
function assign(group, positions, prevRow, rng) {
  const out = {};
  const used = new Set();
  const order = rng.shuffle(positions);
  const rank = (p, pos) => (prefers(p, pos) ? 0 : 2) + (prevRow && prevRow[p.id] === pos ? 1 : 0) + rng.next() * 0.5;
  function bt(i) {
    if (i === order.length) return true;
    const pos = order[i];
    const cands = group
      .filter((p) => !used.has(p.id) && !cantPlay(p, pos) && !(pos === 'P' && p.callUp)) // 4.6, A18
      .sort((a, b) => rank(a, pos) - rank(b, pos));
    for (const p of cands) {
      used.add(p.id); out[p.id] = pos;
      if (bt(i + 1)) return true;
      used.delete(p.id); delete out[p.id];
    }
    return false;
  }
  return bt(0) ? out : null;
}

// Soft goals: variety, preferences, catcher pairs, balanced infield/outfield time.
function scoreLineup(div, players, innings) {
  let score = 0;
  const inf = new Map(), of = new Map();
  for (const p of players) { inf.set(p.id, 0); of.set(p.id, 0); }
  innings.forEach((row, k) => {
    for (const p of players) {
      const pos = row[p.id];
      if (pos == null || pos === SIT) continue;
      if (k > 0 && innings[k - 1][p.id] === pos) {
        // a catcher or pitcher staying on is good (fewer gear changes); anyone else repeating is not
        score += pos === 'C' || pos === 'P' ? 1 : -3;
      }
      if (prefers(p, pos)) score += 2;
      if (isOutfield(pos)) of.set(p.id, of.get(p.id) + 1); else inf.set(p.id, inf.get(p.id) + 1);
    }
  });
  score -= variance([...inf.values()]) * 2 + variance([...of.values()]) * 2;
  return score;
}

function variance(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}

function pickDistinct(found, n) {
  const picks = [found[0]];
  for (const f of found.slice(1)) {
    if (picks.length >= n) break;
    const differs = picks.every((p) => distance(p.lineup.innings, f.lineup.innings) > 6);
    if (differs) picks.push(f);
  }
  return picks;
}

function distance(a, b) {
  let d = 0;
  a.forEach((row, k) => { for (const id of Object.keys(row)) if (row[id] !== b[k][id]) d++; });
  return d;
}

export { displayName };
