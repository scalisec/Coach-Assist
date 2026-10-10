import { h, header, icon, toast } from '../ui.js';
import { store } from '../store.js';
import { go } from '../main.js';
import { check, scoreSheetData, scoreSheetFileName, gameTitle, formatDate } from '../model.js';
import { fillScoreSheet } from '../pdf/scoresheet.js';

let pdfLibPromise;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  pdfLibPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'src/vendor/pdf-lib.min.js';
    s.onload = () => resolve(window.PDFLib);
    s.onerror = () => { pdfLibPromise = null; reject(new Error('Could not load the PDF tool')); };
    document.head.append(s);
  });
  return pdfLibPromise;
}

let templatePromise;
const loadTemplate = () => (templatePromise ||= fetch('assets/score_sheet.pdf').then((r) => {
  if (!r.ok) { templatePromise = null; throw new Error('Could not load the score sheet form'); }
  return r.arrayBuffer();
}));

export async function buildScoreSheet(team, game) {
  const [PDFLib, template] = await Promise.all([loadPdfLib(), loadTemplate()]);
  const bytes = await fillScoreSheet(PDFLib, template, scoreSheetData(team, game));
  return new File([bytes], scoreSheetFileName(team, game), { type: 'application/pdf' });
}

export function exportView(id) {
  const game = store.state.games.find((g) => g.id === id);
  const team = game && store.state.teams.find((t) => t.id === game.teamId);
  if (!game?.lineup || !team) { go('#/home'); return null; }
  const res = check(team, game);
  const data = scoreSheetData(team, game);

  const missing = [];
  if (!game.opponent) missing.push(['Opponent', `#/game/${id}/setup`]);
  if (!team.headCoach) missing.push(['Head coach', `#/team/${team.id}`]);
  const noJersey = data.slots.filter((s) => !s.num).map((s) => s.name);
  if (noJersey.length) missing.push([`Jersey # for ${noJersey.slice(0, 3).join(', ')}${noJersey.length > 3 ? '…' : ''}`, '#/roster']);

  const status = h('span', { class: 'muted', 'data-test': 'pdf-status' }, 'Preparing the score sheet…');
  const shareBtn = h('button', { class: 'btn primary big-btn', disabled: true, 'data-test': 'pdf-share' }, icon('doc'), 'Share PDF');
  const saveLink = h('a', { class: 'btn', 'aria-disabled': 'true', 'data-test': 'pdf-download' }, 'Save to device');
  const openBtn = h('button', { class: 'btn', disabled: true, 'data-test': 'pdf-open' }, 'Open to print');

  let file, url;
  buildScoreSheet(team, game).then((f) => {
    file = f;
    url = URL.createObjectURL(f);
    saveLink.href = url;
    saveLink.download = f.name;
    saveLink.removeAttribute('aria-disabled');
    openBtn.disabled = false;
    shareBtn.disabled = false;
    status.textContent = `Ready: ${f.name} (${Math.round(f.size / 1024)} KB)`;
    status.dataset.ready = 'true';
  }).catch((e) => { status.textContent = `${e.message}. Check your connection and try again.`; });

  shareBtn.addEventListener('click', async () => {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: data.title }); } catch { /* cancelled */ }
    } else {
      saveLink.click();
      toast('Saved. Attach it to an email or text from your downloads.');
    }
  });
  openBtn.addEventListener('click', () => { window.open(url, '_blank'); });

  const node = h('div', {},
    header({ title: 'Score sheet', sub: `${gameTitle(game)} · ${formatDate(game.date)}`, back: `#/game/${id}` }),
    h('main', { class: 'page' },
      res.ok
        ? h('div', { class: 'banner good' }, icon('shieldOk'), h('div', { class: 'grow' }, h('strong', {}, 'Fair play ✓ checked before export'),
          h('span', { style: 'font-size:13px;color:#24563A' }, 'Filled into the official BOMBA score sheet. Substitute lines are left blank.')))
        : h('div', { class: 'banner bad' }, icon('alert'), h('div', { class: 'grow' },
          h('strong', {}, `${res.errors.length} fair play issue${res.errors.length === 1 ? '' : 's'}`),
          h('span', { class: 'issue' }, 'The sheet will be marked "Needs Convenor approval". Fix the lineup first if you can.'),
          h('a', { href: `#/game/${id}`, style: 'font-weight:700' }, 'Back to the lineup'))),
      missing.length ? h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'grow' },
        h('strong', {}, 'Missing from the sheet'),
        missing.map(([label, href]) => h('a', { class: 'issue', href }, label)))) : null,
      preview(data),
      status,
      h('div', { class: 'footer-bar', style: 'flex-direction:column;gap:8px' },
        shareBtn,
        h('div', { class: 'btn-row' }, openBtn, saveLink))));
  return { node, nav: 'lineup', noNav: true };
}

// A small picture of the filled sheet, so coaches see what goes out.
function preview(data) {
  const cell = 'border-left:1px solid #9CA3AF;width:24px;text-align:center;color:#1D3FA8;font-weight:700';
  return h('figure', { class: 'card', style: 'margin:0;padding:12px;font-family:Arial,sans-serif;color:#111;overflow-x:auto', 'aria-label': 'Score sheet preview' },
    h('div', { style: 'display:flex;justify-content:space-between;font-size:11px;font-weight:700' },
      h('span', { style: 'font-style:italic;text-decoration:underline' }, 'B.O.M.B.A.'), h('span', {}, 'OFFICIAL SCORESHEET'),
      h('span', {}, 'DIVISION ', h('span', { style: 'color:#1D3FA8' }, data.division))),
    h('div', { style: 'display:flex;justify-content:space-between;font-size:10px;padding:6px 0;border-bottom:1px solid #9CA3AF' },
      h('span', {}, h('b', { style: 'color:#1D3FA8' }, `${data.team1.name} (${data.home ? 'H' : 'V'})`), ' · ', h('b', { style: 'color:#1D3FA8' }, `${data.team2.name || '—'} (${data.home ? 'V' : 'H'})`)),
      h('span', {}, 'GAME # ', h('b', { style: 'color:#1D3FA8' }, data.gameNo || '—'), ' · ', h('b', { style: 'color:#1D3FA8' }, data.date))),
    h('table', { style: 'border-collapse:collapse;width:100%;font-size:10px;margin-top:4px' },
      h('thead', {}, h('tr', {}, h('th', { style: 'text-align:left;width:16px' }, '#'), h('th', { style: 'text-align:left;width:22px' }, 'NO.'), h('th', { style: 'text-align:left' }, 'PLAYER'),
        [1, 2, 3, 4, 5, 6, 7].map((n) => h('th', { style: 'width:24px' }, String(n))))),
      h('tbody', {}, data.slots.map((s, i) => h('tr', { style: 'border-top:1px solid #D1D5DB;height:18px' },
        h('td', { style: 'font-weight:700' }, String(i + 1)), h('td', { style: 'color:#1D3FA8;font-weight:700' }, s.num),
        h('td', { style: 'color:#1D3FA8;font-weight:700;white-space:nowrap' }, s.name),
        s.pos.map((p) => h('td', { style: cell }, p)))))));
}
