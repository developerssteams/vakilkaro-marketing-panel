import { MARKETING_STORAGE_PREFIX } from "./marketing-config";

export function storageKey(datasetKey) {
  return `${MARKETING_STORAGE_PREFIX}${datasetKey}`;
}

export function readRows(datasetKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(datasetKey));
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function writeRows(datasetKey, rows) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(datasetKey), JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey } }));
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
  try { return JSON.parse(window.localStorage.getItem(`${MARKETING_STORAGE_PREFIX}settings`) || "{}"); }
  catch { return {}; }
}

export function writeSettings(settings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${MARKETING_STORAGE_PREFIX}settings`, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey: "settings" } }));
}

export function clearMarketingData() {
  if (typeof window === "undefined") return;
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(MARKETING_STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent("vk-marketing-updated", { detail: { datasetKey: "all" } }));
}
