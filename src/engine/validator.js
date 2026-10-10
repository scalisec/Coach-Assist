// Independent checker for a lineup. Runs after every generate and every edit.
// Rule interpretations follow the Decisions & Assumptions Log:
//   D1  4.2 and 4.3 are satisfied if met by the end of each inning.
//   A5  "each player" in 4.3 means every player on hand that inning, benched or not.
//   A6  4.1 and 4.2 apply to all divisions; 4.3 to 13U and below.
//   D25 4.6 (call-ups can't pitch) applies only where players pitch (11U and up).

import { getDivision, fieldPositions, isOutfield, SIT, INFIELD, ALL_OUTFIELD } from './divisions.js';
import { displayName, isPresent, cantPlay } from './players.js';

const VALID = new Set([...INFIELD, ...ALL_OUTFIELD, SIT]);

/**
 * @param {object} args
 * @param {string} args.division   division code, e.g. '8U'
 * @param {Array}  args.players    [{id, jersey, first, last, cantPlay, preferred, canPitch, canCatch, callUp, availableFrom, availableUntil}]
 * @param {object} args.lineup     {battingOrder: [id], innings: [{[id]: position}]}
 * @returns {{ok:boolean, errors:Array, warnings:Array}}
 */
export function validateLineup({ division: code, players, lineup }) {
  const div = getDivision(code);
  const innings = lineup.innings || [];
  const total = div.innings;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id) => displayName(byId.get(id) || { first: String(id) });
  const errors = [];
  const warnings = [];
  const err = (rule, message, extra = {}) => errors.push({ level: 'error', rule, message, ...extra });
  const warn = (rule, message, extra = {}) => warnings.push({ level: 'warning', rule, message, ...extra });

  if (innings.length > total) err('structure', `${div.code} games are ${total} innings; this lineup has ${innings.length}.`);

  const sits = new Map(players.map((p) => [p.id, 0]));
  const ofs = new Map(players.map((p) => [p.id, 0]));
  const catches = new Map(players.map((p) => [p.id, 0]));
  const pitches = new Map(players.map((p) => [p.id, []]));

  innings.forEach((row, k) => {
    const inn = k + 1;
    const present = players.filter((p) => isPresent(p, k, total));
    const expected = fieldPositions(div, present.length);

    // ---- structure ----
    for (const id of Object.keys(row)) {
      const p = byId.get(coerce(id, byId));
      if (!p) err('structure', `Inning ${inn} lists a player who isn't on the roster.`, { inning: inn });
      else if (!isPresent(p, k, total) && row[id] != null) err('structure', `${name(p.id)} isn't here in inning ${inn} but has a position.`, { inning: inn, players: [p.id] });
    }
    const counts = {};
    for (const p of present) {
      const pos = row[p.id];
      if (pos == null || pos === '') { err('structure', `${name(p.id)} has no position in inning ${inn}.`, { inning: inn, players: [p.id] }); continue; }
      if (!VALID.has(pos)) { err('structure', `"${pos}" isn't a position (inning ${inn}, ${name(p.id)}).`, { inning: inn, players: [p.id] }); continue; }
      counts[pos] = (counts[pos] || 0) + 1;
    }
    for (const pos of expected) {
      if (!counts[pos]) err('structure', `Nobody is at ${pos} in inning ${inn}.`, { inning: inn });
      else if (counts[pos] > 1) err('structure', `${counts[pos]} players are at ${pos} in inning ${inn}.`, { inning: inn });
    }
    for (const pos of Object.keys(counts)) {
      if (pos !== SIT && !expected.includes(pos)) err('structure', `${pos} isn't used with ${present.length} players (inning ${inn}).`, { inning: inn });
    }

    // ---- tallies ----
    for (const p of present) {
      const pos = row[p.id];
      if (pos === SIT) sits.set(p.id, sits.get(p.id) + 1);
      if (isOutfield(pos)) ofs.set(p.id, ofs.get(p.id) + 1);
      if (pos === 'C') catches.set(p.id, catches.get(p.id) + 1);
      if (pos === 'P') pitches.get(p.id).push(k);
    }

    for (const p of present) {
      const pos = row[p.id];
      // 4.1 no back-to-back sits
      if (pos === SIT && k > 0 && isPresent(p, k - 1, total) && innings[k - 1][p.id] === SIT) {
        err('4.1', `${name(p.id)} sits innings ${inn - 1} and ${inn} in a row.`, { inning: inn, players: [p.id] });
      }
      // 4.2 nobody sits a 2nd inning until everyone has sat once (checked at end of inning, D1)
      if (pos === SIT && sits.get(p.id) === 2) {
        const notYet = present.filter((q) => sits.get(q.id) === 0);
        if (notYet.length) {
          err('4.2', `${name(p.id)} sits a 2nd time in inning ${inn}; ${list(notYet.map((q) => name(q.id)))} ${notYet.length > 1 ? "haven't" : "hasn't"} sat yet.`,
            { inning: inn, players: [p.id, ...notYet.map((q) => q.id)] });
        }
      }
      // 4.3 nobody plays a 3rd outfield inning until everyone has played two (13U and below, D1)
      if (div.rule43 && isOutfield(pos) && ofs.get(p.id) >= 3) {
        const short = present.filter((q) => ofs.get(q.id) < 2);
        if (short.length) {
          const q = short[0];
          err('4.3', `${name(p.id)} plays a ${ordinal(ofs.get(p.id))} outfield inning in inning ${inn} while ${name(q.id)} has ${ofs.get(q.id) || 'none'}${short.length > 1 ? ` (and ${short.length - 1} more under 2)` : ''}.`,
            { inning: inn, players: [p.id, ...short.map((s) => s.id)] });
        }
      }
      // catching limit
      if (pos === 'C' && catches.get(p.id) === div.catchMax + 1) {
        err('catch', `${name(p.id)} catches ${catches.get(p.id)} innings (${div.code} max ${div.catchMax}).`, { inning: inn, players: [p.id] });
      }
      // pitching limits
      if (pos === 'P') {
        const pl = byId.get(p.id);
        if (pl.callUp && div.playerPitching) err('4.6', `Call-up ${name(p.id)} is pitching in inning ${inn}; call-ups can't pitch.`, { inning: inn, players: [p.id] });
        if (div.playerPitching) {
          const list_ = pitches.get(p.id);
          if (div.pitchMax && list_.length === div.pitchMax + 1) err('pitch', `${name(p.id)} pitches ${list_.length} innings (${div.code} max ${div.pitchMax}).`, { inning: inn, players: [p.id] });
          if (list_.length > 1 && list_[list_.length - 2] !== k - 1) err('pitch', `${name(p.id)} pitches innings ${list_[list_.length - 2] + 1} and ${inn}; pitching innings must be back-to-back.`, { inning: inn, players: [p.id] });
          if (!pl.canPitch && !pl.callUp) warn('pitch', `${name(p.id)} is pitching in inning ${inn} but isn't marked "can pitch".`, { inning: inn, players: [p.id] });
        }
      }
      if (pos === 'C' && div.playerPitching && !byId.get(p.id).canCatch) {
        warn('catch', `${name(p.id)} is catching in inning ${inn} but isn't marked "can catch".`, { inning: inn, players: [p.id] });
      }
      // combined catch + pitch
      if (div.comboMax && (pos === 'C' || pos === 'P') && catches.get(p.id) + pitches.get(p.id).length === div.comboMax + 1) {
        err('combo', `${name(p.id)} catches ${catches.get(p.id)} and pitches ${pitches.get(p.id).length} innings (max ${div.comboMax} combined).`, { inning: inn, players: [p.id] });
      }
      // coach restrictions
      if (pos && pos !== SIT && cantPlay(byId.get(p.id), pos)) {
        warn('restriction', `${name(p.id)} is at ${pos} in inning ${inn}, marked can't play ${pos}.`, { inning: inn, players: [p.id] });
      }
    }
  });

  // minimum catchers, judged on a complete game
  if (div.minCatchers && innings.length === total) {
    const used = [...catches.entries()].filter(([, c]) => c > 0).length;
    if (used < div.minCatchers) err('catchers', `Only ${used} catcher${used === 1 ? '' : 's'} used (${div.code} needs at least ${div.minCatchers}).`);
  }

  // batting order: everyone who plays bats exactly once (4.4)
  const order = lineup.battingOrder || [];
  const seen = new Set();
  for (const id of order) {
    if (!byId.has(id)) err('batting', 'The batting order lists a player who isn\'t on the roster.');
    else if (seen.has(id)) err('batting', `${name(id)} is in the batting order twice.`, { players: [id] });
    seen.add(id);
  }
  const playing = players.filter((p) => innings.some((_, k) => isPresent(p, k, total)) || innings.length === 0);
  for (const p of playing) if (!seen.has(p.id)) err('batting', `${name(p.id)} is missing from the batting order.`, { players: [p.id] });
  for (const p of playing) if (p.jersey == null || p.jersey === '') warn('jersey', `Add a jersey # for ${name(p.id)}.`, { players: [p.id] });

  return { ok: errors.length === 0, errors, warnings };
}

function coerce(id, byId) {
  // Object keys are strings; roster ids may be numbers.
  return byId.has(id) ? id : Number(id);
}
const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const list = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more`);
