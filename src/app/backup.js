// One-file backup of everything on this device (teams, rosters, saved games).

export function makeBackup(state, now = new Date()) {
  return JSON.stringify({ app: 'CoachAssist', kind: 'backup', version: 1, exportedAt: now.toISOString(), state }, null, 1);
}

export function backupFileName(now = new Date()) {
  return `CoachAssist-backup-${now.toISOString().slice(0, 10)}.json`;
}

// Returns {ok, state, summary} or {ok:false, message}
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, message: "That file isn't a CoachAssist backup." }; }
  if (data?.app !== 'CoachAssist' || data.kind !== 'backup' || !data.state) return { ok: false, message: "That file isn't a CoachAssist backup." };
  if (data.version > 1) return { ok: false, message: 'This backup was made by a newer CoachAssist. Update the app, then try again.' };
  const s = data.state;
  if (!Array.isArray(s.teams) || !Array.isArray(s.games)) return { ok: false, message: 'This backup looks damaged.' };
  for (const t of s.teams) if (!t.id || !t.name || !Array.isArray(t.players)) return { ok: false, message: 'This backup looks damaged.' };
  const players = s.teams.reduce((n, t) => n + t.players.filter((p) => p.active !== false).length, 0);
  return {
    ok: true,
    state: { version: 1, teams: s.teams, games: s.games, currentTeamId: s.currentTeamId || s.teams[0]?.id || null, lastBackup: s.lastBackup },
    summary: `${s.teams.length} team${s.teams.length === 1 ? '' : 's'}, ${players} players, ${s.games.filter((g) => g.lineup).length} saved lineups`,
    exportedAt: data.exportedAt,
  };
}
