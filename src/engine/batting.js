// Batting order (D9, A1, A2, rule 3.2.6).
// Game 1: random. Later games: last game's bottom third moves to the top, then a light
// shuffle within each third. Players new to the order bat after the regulars; late
// arrivals always bat last.

import { makeRng } from './random.js';

/**
 * @param {Array} ids             players batting this game, on hand from the first inning
 * @param {Array} [previousOrder] last game's batting order (ids)
 * @param {object} [opts]         {lateIds: ids arriving after the start, rng | seed}
 */
export function rotateBattingOrder(ids, previousOrder, opts = {}) {
  const rng = opts.rng || makeRng(opts.seed);
  const late = (opts.lateIds || []).filter((id) => !ids.includes(id));
  const prev = (previousOrder || []).filter((id) => ids.includes(id));

  let order;
  if (prev.length === 0) {
    order = rng.shuffle(ids);
  } else {
    const n = prev.length;
    const t = Math.ceil(n / 3);
    const rotated = [...prev.slice(n - t), ...prev.slice(0, n - t)];
    order = [];
    const size = Math.ceil(n / 3);
    for (let i = 0; i < n; i += size) order.push(...rng.shuffle(rotated.slice(i, i + size)));
    const newcomers = rng.shuffle(ids.filter((id) => !prev.includes(id)));
    order.push(...newcomers);
  }
  return [...order, ...rng.shuffle(late)];
}
