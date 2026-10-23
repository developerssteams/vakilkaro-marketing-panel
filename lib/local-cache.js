/* ============================================================
   lib/local-cache.js — BROWSER ONLY

   Browser me panel ke data ki copy kahan rakhein.

   localStorage sirf ~5 MB leta hai. Daily stats bade ho gaye to
   "QuotaExceededError" aata tha aur sync ruk jaata tha. Ab:
   - Pehle localStorage (jaise pehle tha, turant padhta hai)
   - Wahan jagah na bache → wo dataset IndexedDB me chala jaata hai
     (sau-do sau MB tak jagah). Page khulte hi IndexedDB se memory me
     aa jaata hai; tab tak ke liye "vk-marketing-updated" event se
     screens dobara padh leti hain.
   - Shared-sync ka hisaab (base) hamesha IndexedDB me.

   Sab kuch memory me bhi rehta hai, isliye readRows pehle jaisa
   turant (sync) chalta hai.
   ============================================================ */

const DB_NAME = "vk_panel_cache";
const STORE = "kv";
const IDB_LIST = "vk_idb_keys_v1";      /* kaun-se keys IndexedDB me hain (chhoti list, localStorage me) */

const mem = new Map();
let idbKeys = null;
let hydrated = false;
let hydrateP = null;
const pending = new Map();               /* hydrate se pehle IndexedDB keys pe aayi writes */

const hasWindow = () => typeof window !== "undefined";

function ls() { try { return window.localStorage; } catch { return null; } }

function loadIdbKeys() {
  if (idbKeys) return idbKeys;
  try { idbKeys = new Set(JSON.parse(ls()?.getItem(IDB_LIST) || "[]")); } catch { idbKeys = new Set(); }
  return idbKeys;
}
function saveIdbKeys() { try { ls()?.setItem(IDB_LIST, JSON.stringify([...loadIdbKeys()])); } catch { /* */ } }

/* ---------- IndexedDB (chhota wrapper) ---------- */
let dbP = null;
function db() {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      if (!hasWindow() || !window.indexedDB) { reject(new Error("IndexedDB not available")); return; }
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbP.catch(() => { dbP = null; });
  }
  return dbP;
}
function idbTx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const st = tx.objectStore(STORE);
    const out = fn(st);
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
const idbPut = (k, v) => idbTx("readwrite", (st) => st.put(v, k)).catch(() => {});
const idbDel = (k) => idbTx("readwrite", (st) => st.delete(k)).catch(() => {});
const idbGetAll = (keys) => db().then((d) => new Promise((resolve) => {
  const out = {};
  const tx = d.transaction(STORE, "readonly");
  const st = tx.objectStore(STORE);
  keys.forEach((k) => { const r = st.get(k); r.onsuccess = () => { if (r.result != null) out[k] = r.result; }; });
  tx.oncomplete = () => resolve(out);
  tx.onerror = () => resolve(out);
})).catch(() => ({}));

/* ---------- public ---------- */

/* Ye keys hamesha IndexedDB me (localStorage ki jagah bachane ke liye) */
const ALWAYS_IDB = new Set();
export function preferIdb(key) { ALWAYS_IDB.add(key); }

export function getRaw(key) {
  if (!hasWindow()) return null;
  if (pending.has(key)) return pending.get(key);
  if (mem.has(key)) return mem.get(key);
  if (loadIdbKeys().has(key)) return null;      /* abhi IndexedDB se aa raha hai */
  try { return ls()?.getItem(key) ?? null; } catch { return null; }
}

function moveToIdb(key, value) {
  loadIdbKeys().add(key); saveIdbKeys();
  try { ls()?.removeItem(key); } catch { /* */ }
  mem.set(key, value);
  idbPut(key, value);
}

export function setRaw(key, value) {
  if (!hasWindow()) return;
  const v = String(value);
  if (loadIdbKeys().has(key)) {
    if (!hydrated) { pending.set(key, v); return; }
    mem.set(key, v); idbPut(key, v); return;
  }
  if (ALWAYS_IDB.has(key)) { moveToIdb(key, v); return; }
  try {
    ls().setItem(key, v);
    mem.delete(key);
  } catch {
    /* localStorage bhar gaya → ye dataset IndexedDB me */
    moveToIdb(key, v);
  }
}

export function removeRaw(key) {
  if (!hasWindow()) return;
  mem.delete(key); pending.delete(key);
  try { ls()?.removeItem(key); } catch { /* */ }
  if (loadIdbKeys().has(key)) { loadIdbKeys().delete(key); saveIdbKeys(); idbDel(key); }
}

export function keysWithPrefix(prefix) {
  const out = new Set();
  try {
    const s = ls();
    for (let i = 0; i < (s?.length || 0); i += 1) { const k = s.key(i); if (k && k.startsWith(prefix)) out.add(k); }
  } catch { /* */ }
  loadIdbKeys().forEach((k) => { if (k.startsWith(prefix)) out.add(k); });
  mem.forEach((_, k) => { if (k.startsWith(prefix)) out.add(k); });
  return [...out];
}

/* Page khulte hi: IndexedDB wale keys memory me. Ho jaane pe screens ko bata do. */
export function hydrateCache() {
  if (!hasWindow()) return Promise.resolve();
  if (hydrateP) return hydrateP;
  hydrateP = (async () => {
    /* ALWAYS_IDB wale keys pehle localStorage me pade hon to IndexedDB me le jao */
    ALWAYS_IDB.forEach((k) => {
      try { const v = ls()?.getItem(k); if (v != null && !loadIdbKeys().has(k)) moveToIdb(k, v); } catch { /* */ }
    });
    const keys = [...loadIdbKeys()];
    if (keys.length) {
      const got = await idbGetAll(keys);
      Object.entries(got).forEach(([k, v]) => { if (!pending.has(k)) mem.set(k, v); });
    }
    hydrated = true;
    pending.forEach((v, k) => { mem.set(k, v); idbPut(k, v); });
    pending.clear();
    if (keys.length) window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey: "all", hydrated: true } }));
  })();
  return hydrateP;
}

export function isHydrated() { return hydrated; }
