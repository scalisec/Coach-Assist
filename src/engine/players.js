// Small helpers shared by the validator and the generator.

export const displayName = (p) =>
  [p.first, p.last ? `${p.last[0]}.` : ''].filter(Boolean).join(' ') || `#${p.jersey ?? '?'}`;

// A player is on hand for inning k (0-based) when availableFrom <= k < availableUntil.
// Late arrivals and early departures (A13) use these two fields.
export function isPresent(player, k, innings) {
  const from = player.availableFrom ?? 0;
  const until = player.availableUntil ?? innings;
  return k >= from && k < until;
}

export const cantPlay = (p, pos) => (p.cantPlay || []).includes(pos);
export const prefers = (p, pos) => (p.preferred || []).includes(pos);
