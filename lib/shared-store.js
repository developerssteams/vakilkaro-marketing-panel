/* ============================================================
   lib/shared-store.js — BROWSER ONLY

   Panel ka data sabke liye ek — database (panel_rows) me.

   Kaise chalta hai:
   - Components pehle jaise readRows / writeRows hi use karte hain.
     Browser me ek copy (cache) rehti hai, isliye page turant khulta hai.
   - writeRows ke baad yahan "push": sirf jo rows badli / nayi / hati
     (har row ka chhota fingerprint yaad rehta hai — "base").
   - Har 20 second (aur tab pe wapas aate hi) "pull": doosre computers
     ke badlav aa jaate hain.

   Pehli baar kisi browser me:
   - Database me us data ka koi hissa pehle se hai → database wala hi
     maana jaata hai (is browser ki purani adhoori copy hat jaati hai).
   - Database me nahi hai → is browser ka data upload ho jaata hai.
   Isliye sabse pehle wahi computer kholo jisme poora data hai.

   DATABASE_URL na ho (ya DB band) → sab pehle jaisa sirf is browser me.
   ============================================================ */
import { MARKETING_STORAGE_PREFIX } from "./marketing-config";
import { getRaw, setRaw, removeRaw, keysWithPrefix, hydrateCache, preferIdb } from "./local-cache";

const P = MARKETING_STORAGE_PREFIX;
const BASE = "vk_shared_base_v1";
const SEQ = "vk_shared_seq_v1";
const INIT = "vk_shared_init_v1";
const SETTINGS = "settings";
const CHUNK = 300;
const EVERY = 20000;
/* Fingerprint ki list badi hoti hai — localStorage ki jagah IndexedDB me */
preferIdb(BASE);

let started = false;
let enabled = false;
let lastError = "";
let resolveReady;
const readyP = typeof window === "undefined" ? Promise.resolve() : new Promise((r) => { resolveReady = r; });
const dirty = new Set();
let timer = null;
let busy = false;
let baseCache = null;

/* ---------- helpers ---------- */
function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}
function fp(row) {
  const s = stable(row);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(36)}${s.length.toString(36)}`;
}
function lsGet(k) { return getRaw(k); }
function lsSet(k, v) { setRaw(k, v); return true; }
function lsDel(k) { removeRaw(k); }

function loadBase() {
  if (!baseCache) { try { baseCache = JSON.parse(lsGet(BASE) || "{}") || {}; } catch { baseCache = {}; } }
  return baseCache;
}
function saveBase() { lsSet(BASE, JSON.stringify(baseCache || {})); }

function emit(ds) { window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey: ds, shared: true } })); }

/* Dataset → rows. Settings ek object hai — use ek row bana ke rakhte hain. */
function readLocal(ds) {
  try {
    const v = JSON.parse(lsGet(P + ds) || (ds === SETTINGS ? "{}" : "[]"));
    if (ds === SETTINGS) return v && typeof v === "object" && Object.keys(v).length ? [{ ...v, id: "__all" }] : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeLocal(ds, rows) {
  if (ds === SETTINGS) {
    const r = rows[0] ? { ...rows[0] } : {};
    delete r.id;
    lsSet(P + ds, JSON.stringify(r));
  } else {
    lsSet(P + ds, JSON.stringify(rows));
  }
}
function localDatasets() {
  return keysWithPrefix(P).map((k) => k.slice(P.length));
}

/* Bina id wali row ko pakki id do (warna database me pehchaan nahi) */
function withIds(ds, rows) {
  let changed = false;
  const seen = new Set();
  const out = rows.map((r, i) => {
    if (!r || typeof r !== "object") return r;
    let id = r.id != null && r.id !== "" ? String(r.id) : "";
    if (!id || seen.has(id)) { id = `${ds.slice(0, 6)}-${fp(r)}-${i}`; changed = true; }
    seen.add(id);
    return String(r.id) === id ? r : { ...r, id };
  }).filter((r) => r && typeof r === "object");
  return { rows: out, changed };
}

async function api(path, opts) {
  const r = await fetch(path, { cache: "no-store", ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/* ---------- push: sirf badlav ---------- */
async function pushDs(ds) {
  const fixed = withIds(ds, readLocal(ds));
  if (fixed.changed) writeLocal(ds, fixed.rows);
  const rows = fixed.rows;
  const base = loadBase();
  const b = base[ds] || {};
  const ups = [];
  const now = {};
  rows.forEach((r, i) => {
    const id = String(r.id);
    const h = fp(r);
    now[id] = h;
    if (b[id] !== h) ups.push({ id, data: r, pos: i, h });
  });
  const dels = Object.keys(b).filter((id) => !(id in now));
  if (!ups.length && !dels.length) return;

  for (let i = 0; i < ups.length; i += CHUNK) {
    const part = ups.slice(i, i + CHUNK);
    await api("/api/data/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ds, upserts: part.map(({ id, data, pos }) => ({ id, data, pos })), deletes: [] }) });
    base[ds] = { ...(base[ds] || {}) };
    part.forEach((x) => { base[ds][x.id] = x.h; });
    saveBase();
  }
  for (let i = 0; i < dels.length; i += 2000) {
    const part = dels.slice(i, i + 2000);
    await api("/api/data/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ds, upserts: [], deletes: part }) });
    base[ds] = { ...(base[ds] || {}) };
    part.forEach((id) => { delete base[ds][id]; });
    saveBase();
  }
}

async function pushAll() {
  const list = [...dirty];
  dirty.clear();
  for (const ds of list) {
    try { await pushDs(ds); } catch (e) { dirty.add(ds); throw e; }
  }
}

/* ---------- pull: doosron ke badlav ---------- */
async function fetchSince(since) {
  const all = [];
  let s = since;
  for (let guard = 0; guard < 400; guard += 1) {
    const j = await api(`/api/data/pull?since=${s}`);
    all.push(...(j.rows || []));
    s = j.last || s;
    if (!j.more) break;
  }
  return { rows: all, last: s };
}

function applyRows(byDs, { replace = false } = {}) {
  const base = loadBase();
  Object.entries(byDs).forEach(([ds, list]) => {
    if (replace) {
      /* Pehli baar: database wala hi sach */
      const live = list.filter((x) => !x.deleted && x.data).sort((a, b) => a.pos - b.pos);
      const rows = live.map((x) => ({ ...x.data, id: x.id }));
      writeLocal(ds, rows);
      base[ds] = {};
      rows.forEach((r) => { base[ds][String(r.id)] = fp(r); });
      emit(ds);
      return;
    }
    const local = readLocal(ds);
    const idx = new Map(local.map((r, i) => [String(r.id), i]));
    const b = base[ds] || (base[ds] = {});
    let rows = [...local];
    const fresh = [];
    let touched = false;
    list.forEach((x) => {
      const id = String(x.id);
      const i = idx.get(id);
      const mine = i !== undefined ? rows[i] : null;
      /* Is browser me badla hai aur abhi upload nahi hua — apna rakho, wo jaayega */
      if (mine && b[id] && fp(mine) !== b[id]) return;
      if (x.deleted || !x.data) {
        if (i !== undefined) { rows[i] = null; touched = true; }
        delete b[id];
        return;
      }
      const row = { ...x.data, id };
      const h = fp(row);
      if (mine && fp(mine) === h) { b[id] = h; return; }
      if (i !== undefined) rows[i] = row; else fresh.push(row);
      b[id] = h;
      touched = true;
    });
    if (!touched) return;
    rows = [...fresh, ...rows.filter(Boolean)];
    writeLocal(ds, rows);
    emit(ds);
  });
  saveBase();
}

function group(rows) {
  const by = {};
  rows.forEach((x) => { (by[x.ds] || (by[x.ds] = [])).push(x); });
  return by;
}

async function pull() {
  const seq = Number(lsGet(SEQ) || 0);
  /* Thoda peeche se — saath-saath likhe gaye badlav chhoot na jaayein */
  const { rows, last } = await fetchSince(Math.max(0, seq - 300));
  if (rows.length) applyRows(group(rows));
  lsSet(SEQ, String(Math.max(seq, last)));
}

async function tick() {
  if (busy || !enabled) return;
  busy = true;
  try {
    await pushAll();
    await pull();
    lastError = "";
  } catch (e) {
    lastError = e?.message || "Shared data could not sync";
  } finally {
    busy = false;
    window.dispatchEvent(new CustomEvent("vk-shared-state"));
  }
}

/* ---------- public ---------- */

/* writeRows / writeSettings ke baad */
export function markDirty(ds) {
  if (typeof window === "undefined") return;
  dirty.add(ds);
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(tick, 1500);
}

export function sharedReady() { return readyP; }
export function sharedState() { return { enabled, error: lastError, busy }; }

export async function startShared() {
  if (typeof window === "undefined" || started) return readyP;
  started = true;
  try {
    /* Pehle browser ki apni copy (IndexedDB) memory me */
    await hydrateCache();
    const st = await api("/api/data/status").catch((e) => ({ enabled: false, error: e.message }));
    if (!st.enabled) { enabled = false; lastError = st.error || ""; return readyP; }
    enabled = true;

    if (!lsGet(INIT)) {
      /* Is browser ki pehli mulaqaat */
      const { rows, last } = await fetchSince(0);
      const by = group(rows);
      const onServer = new Set(Object.keys(by).filter((ds) => by[ds].some((x) => !x.deleted)));
      applyRows(Object.fromEntries(Object.entries(by).filter(([ds]) => onServer.has(ds))), { replace: true });
      localDatasets().forEach((ds) => { if (!onServer.has(ds)) dirty.add(ds); });
      lsSet(SEQ, String(last));
      await pushAll();
      lsSet(INIT, new Date().toISOString());
    } else {
      /* Pichli baar ke baad yahan kuch badla ho to bhejo, fir naya lo */
      localDatasets().forEach((ds) => dirty.add(ds));
      await pushAll();
      await pull();
    }
    lastError = "";
  } catch (e) {
    lastError = e?.message || "Shared data could not load";
  } finally {
    resolveReady();
    window.dispatchEvent(new CustomEvent("vk-shared-state"));
  }

  setInterval(() => { if (document.visibilityState === "visible") tick(); }, EVERY);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
  window.addEventListener("focus", () => tick());
  return readyP;
}

/* Settings → "Clear data": sirf is browser ki copy hatao, database
   ko mat chhedo — agli baar database se dobara aa jaayega. */
export function resetSharedCache() {
  if (typeof window === "undefined") return;
  baseCache = {};
  lsDel(BASE); lsDel(SEQ); lsDel(INIT);
  dirty.clear();
}
