import { MARKETING_STORAGE_PREFIX } from "./marketing-config";
import { markDirty, resetSharedCache } from "./shared-store";
import { getRaw, setRaw, removeRaw, keysWithPrefix, hydrateCache } from "./local-cache";

/* Bade datasets IndexedDB me — page khulte hi memory me laana shuru */
if (typeof window !== "undefined") hydrateCache();

export function storageKey(datasetKey) {
  return `${MARKETING_STORAGE_PREFIX}${datasetKey}`;
}

export function readRows(datasetKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = getRaw(storageKey(datasetKey));
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function writeRows(datasetKey, rows) {
  if (typeof window === "undefined") return;
  /* localStorage bhar jaaye to apne aap IndexedDB me (lib/local-cache) */
  setRaw(storageKey(datasetKey), JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey } }));
  /* Shared database me bhi (lib/shared-store) — sirf badli rows jaati hain */
  markDirty(datasetKey);
}

export function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- activity log ----------
   Har add / edit / delete / status change yahan likha jaata hai, taaki
   Campaigns ka History tab aur Settings ka Audit tab bina alag plumbing
   ke bhar jaayein. */
const LOG_KEY = "activity-log";

export function logActivity(entry) {
  if (typeof window === "undefined") return;
  const rows = readRows(LOG_KEY);
  const next = [{ id: uid(), at: new Date().toISOString(), ...entry }, ...rows].slice(0, 400);
  writeRows(LOG_KEY, next);
}

export function readActivity(datasetKeys) {
  const rows = readRows(LOG_KEY);
  if (!datasetKeys || !datasetKeys.length) return rows;
  return rows.filter((r) => datasetKeys.includes(r.dataset));
}

/* ---------- settings ---------- */
export function readSettings() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(getRaw(`${MARKETING_STORAGE_PREFIX}settings`) || "{}"); }
  catch { return {}; }
}

export function writeSettings(settings) {
  if (typeof window === "undefined") return;
  setRaw(`${MARKETING_STORAGE_PREFIX}settings`, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey: "settings" } }));
  markDirty("settings");
}

export function clearMarketingData() {
  if (typeof window === "undefined") return;
  keysWithPrefix(MARKETING_STORAGE_PREFIX).forEach((key) => removeRaw(key));
  /* Shared database ko nahi chhoote — sirf is browser ki copy. Page
     reload pe database se dobara aa jaata hai. */
  resetSharedCache();
  window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey: "all" } }));
}
