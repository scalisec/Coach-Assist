// On-device storage. Everything lives in one small state object saved to IndexedDB,
// with localStorage as a fallback (private windows, older browsers). Nothing leaves
// the device in this stage.

const DB = 'coachassist';
const STORE = 'kv';
const KEY = 'state';

export const EMPTY_STATE = () => ({ version: 1, teams: [], games: [], currentTeamId: null, lastBackup: null });

let state = EMPTY_STATE();
const listeners = new Set();

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readState() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch {
    try { return JSON.parse(localStorage.getItem(DB) || 'null'); } catch { return null; }
  }
}

async function writeState(s) {
  const copy = JSON.parse(JSON.stringify(s));
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(copy, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try { localStorage.setItem(DB, JSON.stringify(copy)); } catch { /* storage full or blocked */ }
  }
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeState(state), 150);
}

export const store = {
  async init() {
    const saved = await readState();
    state = saved && saved.version ? { ...EMPTY_STATE(), ...saved } : EMPTY_STATE();
    return state;
  },
  get state() { return state; },
  // mutate state, save, and notify
  commit(mutator) {
    mutator(state);
    persist();
    listeners.forEach((fn) => fn(state));
  },
  replace(next) { state = next; persist(); listeners.forEach((fn) => fn(state)); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  flush() { clearTimeout(saveTimer); return writeState(state); },
};
