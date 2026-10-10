import { h, header, inputField, selectField, toast, confirmDialog } from '../ui.js';
import { store } from '../store.js';
import { go } from '../main.js';
import { newTeam, DIVISION_CODES } from '../model.js';

export function teamView(id) {
  const existing = store.state.teams.find((t) => t.id === id);
  const isNew = !existing;
  const draft = structuredClone(existing || newTeam());
  const first = store.state.teams.length === 0;

  const save = () => {
    if (!draft.name.trim()) { toast('Give the team a name'); return; }
    draft.name = draft.name.trim();
    draft.divisionTeams = draft.divisionTeams.map((s) => s.trim()).filter(Boolean);
    store.commit((s) => {
      const i = s.teams.findIndex((t) => t.id === draft.id);
      if (i >= 0) s.teams[i] = draft; else s.teams.push(draft);
      s.currentTeamId = draft.id;
    });
    toast(isNew ? 'Team created' : 'Team saved');
    go(isNew ? '#/roster' : '#/settings');
  };

  const remove = async () => {
    if (!(await confirmDialog(`Delete ${draft.name} and all its saved games from this device?`, 'Delete team', { danger: true }))) return;
    store.commit((s) => {
      s.teams = s.teams.filter((t) => t.id !== draft.id);
      s.games = s.games.filter((g) => g.teamId !== draft.id);
      s.currentTeamId = s.teams[0]?.id || null;
    });
    go(store.state.teams.length ? '#/settings' : '#/');
  };

  const node = h('div', {},
    header({ title: isNew ? 'New team' : 'Team details', sub: isNew ? 'You can change any of this later' : draft.name, back: first ? '#/' : (isNew ? '#/settings' : '#/settings') }),
    h('main', { class: 'page' },
      h('section', { class: 'card grid2' },
        inputField('TEAM NAME', draft.name, (v) => { draft.name = v; }, { class: 'span2', test: 'team-name', placeholder: 'e.g. Expos' }),
        selectField('DIVISION', DIVISION_CODES.map((d) => ({ value: d, label: `${d} HL` })), draft.division, (v) => { draft.division = v; }, { test: 'team-division' }),
        inputField('TEAM #', draft.teamNo, (v) => { draft.teamNo = v; }, { inputmode: 'numeric' }),
        inputField('HEAD COACH', draft.headCoach, (v) => { draft.headCoach = v; }, { class: 'span2', hint: 'Printed on the score sheet' }),
        inputField('COACH 2', draft.coaches[0], (v) => { draft.coaches[0] = v; }),
        inputField('COACH 3', draft.coaches[1], (v) => { draft.coaches[1] = v; })),
      h('section', { class: 'card' },
        h('label', { class: 'field' }, 'OTHER TEAMS IN YOUR DIVISION',
          h('textarea', { 'data-test': 'division-teams', placeholder: 'One team per line', oninput: (e) => { draft.divisionTeams = e.target.value.split('\n'); } },
            draft.divisionTeams.join('\n')),
          h('span', { class: 'hint' }, 'Used for the Opponent list in Game setup. Once the league publishes teams, this fills in automatically.'))),
      isNew ? null : h('button', { class: 'btn danger', onclick: remove }, 'Delete this team'),
      h('div', { class: 'footer-bar' },
        h('button', { class: 'btn primary big-btn', onclick: save, 'data-test': 'team-save' }, isNew ? 'Create team' : 'Save'))));
  return { node, nav: 'settings', noNav: first };
}
