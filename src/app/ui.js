// Small DOM helpers. Text always goes in through textContent, never innerHTML,
// except the fixed icon SVGs below.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // icons only
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const ICONS = {
  back: '<path d="m15 6-6 6 6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  roster: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/>',
  lineup: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  saved: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  options: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  shieldOk: '<path d="M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  diamond: '<path d="M24 8 40 24 24 40 8 24z"/><circle cx="24" cy="24" r="3.5" fill="currentColor"/>',
};

export function icon(name, cls = '') {
  const vb = name === 'diamond' ? '0 0 48 48' : '0 0 24 24';
  return h('span', {
    class: `ico ${cls}`, style: 'display:inline-flex',
    'aria-hidden': 'true',
    html: `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  });
}

export function header({ title, sub, back, right, eyebrow }) {
  return h('header', { class: 'top' },
    back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, icon('back')) : null,
    h('div', { class: 'titles' },
      eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null,
      h('h1', {}, title),
      sub ? h('div', { class: 'sub' }, sub) : null),
    right || null);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Bottom sheet built on <dialog>. content(close) returns the body nodes.
export function openSheet(title, content, { center = false } = {}) {
  const dlg = h('dialog', { class: `sheet${center ? ' center' : ''}`, 'aria-label': title });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(h('div', { class: 'sheet-body' },
    center ? null : h('div', { class: 'grip' }),
    h('h2', {}, title),
    content(close)));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

export function confirmDialog(message, okLabel = 'OK', { danger = false } = {}) {
  return new Promise((resolve) => {
    openSheet('Please confirm', (close) => [
      h('p', { style: 'margin:0' }, message),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => { close(); resolve(false); } }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { close(); resolve(true); } }, okLabel)),
    ], { center: true });
  });
}

export function selectField(label, options, value, onChange, attrs = {}) {
  return h('label', { class: `field ${attrs.class || ''}` }, label,
    h('span', { class: 'select-wrap' },
      h('select', { onchange: (e) => onChange(e.target.value), 'data-test': attrs.test },
        options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return h('option', { value: opt.value, selected: opt.value === value }, opt.label);
        })),
      icon('down')));
}

export function inputField(label, value, onInput, attrs = {}) {
  return h('label', { class: `field ${attrs.class || ''}` }, label,
    h('input', { value: value ?? '', type: attrs.type || 'text', inputmode: attrs.inputmode, placeholder: attrs.placeholder,
      autocomplete: 'off', oninput: (e) => onInput(e.target.value), 'data-test': attrs.test }),
    attrs.hint ? h('span', { class: 'hint' }, attrs.hint) : null);
}

export function segmented(options, value, onChange, label) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: () => onChange(o.value) }, o.label)));
}
