/* ============================================================
   lib/sync-merge.js  —  CLIENT ONLY (localStorage)

   Meta/Google se aaya data panel me kaise jaata hai. Pehle ye
   SyncNow ke andar tha; ab "Connect Meta Account" bhi yahi use
   karta hai, isliye alag file.

   Merge upsert hai: same campaign / same din wali entry replace
   hoti hai, jodti nahi — Meta ka data 24-48 ghante tak adjust
   hota rehta hai, toh dobara sync karna normal hai.
   ============================================================ */

import { readRows, writeRows, uid, logActivity } from "./marketing-local";

export const DAILY = "campaigns__daily-stats";
export const ADS = "campaigns__live-ads";
export const ACCOUNTS = "ad-accounts__accounts";
export const SYNC_LOG = "ad-accounts__sync-log";

/* Panel me jude Meta accounts (Active) ki IDs — sync isi list pe chalta hai */
export function panelMetaAccountIds() {
  return [...new Set(readRows(ACCOUNTS)
    .filter((a) => a.platform === "Meta" && String(a.status || "Active") === "Active")
    .map((a) => String(a.accountId || "").trim())
    .filter(Boolean))];
}

/* act_123 → panel ka account naam. Live Ads ka "Ad Account" field
   isi naam se dropdown match karta hai — ID dalte to dropdown khaali
   dikhta aur account-wise filter kaam nahi karta. */
function accountNameMap() {
  const m = {};
  readRows(ACCOUNTS).forEach((a) => {
    const id = String(a.accountId || "").trim();
    if (id) m[id.startsWith("act_") ? id : `act_${id}`] = a.name;
  });
  return m;
}

/* Campaign platform se aaya hai to extId se pehchano, warna naam se.
   Naye add, purane update — manual service tag aur CPL cap kabhi
   overwrite nahi hote. */
export function mergeCampaigns(incoming) {
  if (!incoming.length) return { added: 0, updated: 0 };
  const names = accountNameMap();
  const rows = readRows(ADS);
  const byExt = new Map(rows.filter((r) => r.extId).map((r) => [String(r.extId), r]));
  const byName = new Map(rows.map((r) => [String(r.name || "").toLowerCase(), r]));

  let added = 0; let updated = 0;
  const next = [...rows];

  incoming.forEach((c) => {
    const found = byExt.get(String(c.extId)) || byName.get(String(c.name || "").toLowerCase());
    const patch = {
      name: c.name, status: c.status, metaStatus: c.metaStatus || "", issue: c.issue || "", extId: c.extId,
      account: names[c.account] || c.account, accountId: c.account,
      dailyBudget: String(c.dailyBudget || 0), totalBudget: String(c.totalBudget || 0),
      budgetSource: c.budgetSource || "", goal: c.goal || "", resultLabel: c.resultLabel || "",
      /* objective bhi har sync pe update — pehle purane rows me galat "Leads" reh jaata tha */
      ...(c.objective ? { objective: c.objective } : {}), ...(c.objectiveRaw ? { objectiveRaw: c.objectiveRaw } : {}),
      metaSync: "Synced",
      startDate: c.startDate || "", endDate: c.endDate || "",
      updatedAt: new Date().toISOString(),
    };
    if (found) {
      const i = next.findIndex((r) => r.id === found.id);
      /* Kuch badla hi nahi to row mat chhedo — warna har sync pe saare
         campaigns shared database me dobara likhe jaate */
      const { updatedAt: _u, ...cmp } = patch;
      if (Object.keys(cmp).some((k) => String(next[i][k] ?? "") !== String(cmp[k] ?? ""))) {
        next[i] = { ...next[i], ...patch };
        updated += 1;
      }
    } else {
      next.unshift({
        /* Pakki id — do computer ek saath sync karein to bhi ek hi row */
        id: c.extId ? `mc-${c.account || ""}-${c.extId}` : uid(), level: "Campaign", objective: c.objective || "Leads",
        channel: c.channel || "Facebook", service: "", platform: c.platform,
        spend: "0", leads: "0", won: "0", ...patch,
        createdAt: new Date().toISOString(),
      });
      added += 1;
    }
  });

  writeRows(ADS, next);
  return { added, updated };
}

/* Upsert on date + campaign + channel */
export function mergeDaily(incoming) {
  if (!incoming.length) return 0;
  const rows = readRows(DAILY);
  /* Campaign ID se pehchaan — Ads Manager me naam badla to bhi wahi row
     update ho, nayi na bane */
  const key = (r) => `${String(r.date).slice(0, 10)}|${r.account || ""}|${r.extId || String(r.campaign || "").toLowerCase()}|${r.channel || ""}`;
  const map = new Map(rows.map((r) => [key(r), r]));

  incoming.forEach((d) => {
    const k = key(d);
    const old = map.get(k);
    const row = {
      /* Pakki id (date + account + campaign + platform) — do computer
         ek saath sync karein to bhi duplicate nahi */
      id: old?.id || `md-${k}`,
      date: String(d.date).slice(0, 10),
      campaign: d.campaign,
      channel: d.channel,
      account: d.account || "",
      /* Paise tak rakhte hain — Ads Manager ₹1,202.89 dikhata hai,
         round karke jodne se 30 din me ₹10-15 ka farak aa jaata tha */
      spend: String(Math.round((d.spend || 0) * 100) / 100),
      spendExact: String(d.spend || 0),
      leads: String(d.leads || 0),
      results: String(d.results ?? d.leads ?? 0),
      resultLabel: d.resultLabel || "",
      formLeads: String(d.formLeads || 0),
      chats: String(d.chats || 0),
      impressions: String(d.impressions || 0),
      clicks: String(d.clicks || 0),
      linkClicks: String(d.linkClicks || 0),
      extId: d.extId || old?.extId || "",
      source: d.source,
      createdAt: old?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    /* Number wahi hain to purani row hi rakho (updatedAt bhi nahi badalta) */
    if (old && Object.keys(row).every((f) => f === "updatedAt" || String(old[f] ?? "") === String(row[f] ?? ""))) return;
    map.set(k, row);
  });

  const next = [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  writeRows(DAILY, next);
  return incoming.length;
}

/* Campaign ka total spend/leads/clicks daily rows se — Live Ads ke
   columns khaali na dikhein. Sirf synced campaigns pe lagta hai;
   manual campaigns ki values haath ki hi rehti hain. */
export function rollupCampaignTotals() {
  const daily = readRows(DAILY);
  const tot = {};
  /* Account + naam se key — do accounts me same naam ka campaign ho
     to dono ka spend mil na jaaye */
  const keyOf = (acct, id) => `${acct || ""}|${String(id || "").toLowerCase()}`;
  daily.forEach((d) => {
    const k = keyOf(d.account, d.extId || d.campaign);
    if (!tot[k]) tot[k] = { spend: 0, leads: 0, clicks: 0, impressions: 0, formLeads: 0, chats: 0, linkClicks: 0 };
    tot[k].linkClicks += Number(d.linkClicks || 0);
    tot[k].formLeads += Number(d.formLeads || 0);
    tot[k].chats += Number(d.chats || 0);
    tot[k].spend += Number(d.spend || 0);
    tot[k].leads += Number(d.leads || 0);
    tot[k].clicks += Number(d.clicks || 0);
    tot[k].impressions += Number(d.impressions || 0);
  });
  let changedAny = false;
  const rows = readRows(ADS).map((r) => {
    if (r.metaSync !== "Synced") return r;
    const t = tot[keyOf(r.accountId, r.extId || r.name)] || tot[keyOf("", r.extId || r.name)];
    if (!t) return r;
    const n = { ...r, spend: String(Math.round(t.spend * 100) / 100), leads: String(t.leads), linkClicks: String(t.linkClicks),
      formLeads: String(t.formLeads), chats: String(t.chats),
      clicks: String(t.clicks), impressions: String(t.impressions) };
    if (!["spend", "leads", "linkClicks", "formLeads", "chats", "clicks", "impressions"].some((k) => String(r[k] ?? "") !== n[k])) return r;
    changedAny = true;
    return n;
  });
  if (changedAny) writeRows(ADS, rows);
}

/* Har sync pe account ka taaza haal — lifetime spend, Meta status,
   payment error. Pehle ye sirf "Connect" pe update hota tha, isliye
   Lifetime Spend purana pada rehta tha. */
/* Ek hi ad account (same platform + account ID) do-teen baar jud gaya ho
   (alag computers se connect karne pe hota tha) to ek hi rakho. Default
   wala aur sabse purana bachta hai; baaki ki bhari hui cheezein usme
   jod di jaati hain. Lifetime spend 3 guna nahi dikhta. */
export function dedupeAccounts() {
  const rows = readRows(ACCOUNTS);
  const groups = new Map();
  rows.forEach((r) => {
    const id = String(r.accountId || "").trim();
    if (!id) return;
    const k = `${r.platform || ""}|${id.startsWith("act_") ? id : `act_${id}`}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const drop = new Set();
  const merged = new Map();
  groups.forEach((list) => {
    if (list.length < 2) return;
    const t = (r) => Date.parse(r.createdAt || 0) || 0;
    const sorted = [...list].sort((a, b) => (a.isDefault === "Yes" ? 0 : 1) - (b.isDefault === "Yes" ? 0 : 1) || t(a) - t(b));
    const keep = { ...sorted[0] };
    sorted.slice(1).forEach((o) => {
      Object.keys(o).forEach((f) => { if ((keep[f] === undefined || keep[f] === "") && o[f] !== "" && o[f] !== undefined) keep[f] = o[f]; });
      /* Taaza sync wali cheezein naye row se */
      ["metaStatus", "problem", "amountSpent", "balance", "spendCap", "lastSync", "lastSyncAt"].forEach((f) => {
        if ((Date.parse(o.lastSyncAt || 0) || 0) > (Date.parse(keep.lastSyncAt || 0) || 0) && o[f] !== undefined) keep[f] = o[f];
      });
      drop.add(o.id);
    });
    merged.set(keep.id, keep);
  });
  if (!drop.size) return 0;
  writeRows(ACCOUNTS, rows.filter((r) => !drop.has(r.id)).map((r) => merged.get(r.id) || r));
  return drop.size;
}

export function mergeAccounts(incoming) {
  if (!incoming?.length) return;
  const rows = readRows(ACCOUNTS);
  const now = new Date().toISOString();
  let changed = false;
  const next = rows.map((r) => {
    const a = incoming.find((x) => x.accountId === String(r.accountId || "").trim());
    if (!a) return r;
    changed = true;
    return {
      ...r,
      metaStatus: a.status, problem: a.problem || "",
      amountSpent: String(Math.round(a.amountSpent || 0)),
      balance: String(Math.round(a.balance || 0)),
      spendCap: String(Math.round(a.spendCap || 0)),
      bmName: r.bmName || a.bmName, currency: r.currency || a.currency,
      lastSync: now.slice(0, 10), lastSyncAt: now, updatedAt: now,
    };
  });
  if (changed) writeRows(ACCOUNTS, next);
}

/* Jin accounts me abhi koi dikkat hai (payment error, disabled) —
   cards aur banner isi se bante hain. */
export function accountProblems() {
  return readRows(ACCOUNTS)
    .filter((a) => a.platform === "Meta" && a.problem)
    .map((a) => ({ name: a.name, accountId: a.accountId, problem: a.problem }));
}

/* Sync Log tab me ek row — kab, kitna aaya, error kya tha */
export function writeSyncLog(entry) {
  const rows = readRows(SYNC_LOG);
  writeRows(SYNC_LOG, [{ id: uid(), createdAt: new Date().toISOString(), ...entry }, ...rows].slice(0, 300));
}

export function isoAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/* Ek ya zyada account ka poora sync: campaigns + daily insights +
   account ka haal. Connect, "Sync Meta" button aur auto-sync teeno
   yahi chalate hain. quiet = auto-sync, Sync Log aur History me
   har 5 minute ki entry na bhare. */
/* Data ka formula badla (v2: leads = Ads Manager ka Results, pehle
   form + WhatsApp jodta tha). Purani rows nayi ke saath mix na hon,
   isliye upgrade pe ek baar Meta ki purani rows hata ke dobara laate hain. */
export const DATA_VERSION = 2;
function purgeMetaDaily(accountIds) {
  const ids = new Set(accountIds || []);
  writeRows(DAILY, readRows(DAILY).filter((d) => !(d.source === "Meta Sync" && (!d.account || ids.has(d.account)))));
}

export async function runMetaSync({ accountIds, since, until, quiet = false, purge = false, full = false }) {
  const res = await fetch("/api/sync/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "meta", since, until, accountIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.needsSetup) return { ok: false, error: data.message, needsSetup: true };
  if (!res.ok) return { ok: false, error: data.error || "Sync failed" };

  const errors = data.errors || [];
  if (purge && !errors.length) purgeMetaDaily(accountIds);

  const c = mergeCampaigns(data.campaigns || []);
  const m = mergeDaily(data.daily || []);
  rollupCampaignTotals();
  mergeAccounts(data.accounts || []);

  /* Meta ki limit bhar rahi ho to agla auto-sync rok do */
  const u = data.usage || {};
  const waitMin = Math.max(Number(u.regainMin) || 0, u.pct >= 90 ? 15 : u.pct >= 75 ? 5 : 0);

  const prev = readSyncState() || {};
  saveSyncState({
    at: new Date().toISOString(), since, until, ok: !errors.length, error: errors[0]?.message || "", quiet,
    usagePct: Number(u.pct) || 0,
    backoffUntil: waitMin ? new Date(Date.now() + waitMin * 60000).toISOString() : "",
    midAt: !errors.length && (full || Date.parse(until) - Date.parse(since) >= 6 * 86400000) ? new Date().toISOString() : prev.midAt,
    version: purge && !errors.length ? DATA_VERSION : prev.version,
    fullAt: full && !errors.length ? new Date().toISOString() : prev.fullAt,
  });

  if (!quiet || errors.length) {
    writeSyncLog({
      account: (accountIds || []).join(", ") || "All",
      kind: "Insights",
      runAt: new Date().toISOString().slice(0, 10),
      rows: String(m),
      message: errors.length
        ? errors.map((e) => `${e.account}: ${e.message}`).join(" | ")
        : `${since} → ${until} · ${c.added} new + ${c.updated} updated campaigns`,
      status: errors.length ? (errors.length < (accountIds?.length || 1) ? "Partial" : "Failed") : "Success",
    });
  }
  if (!quiet) {
    logActivity({
      dataset: DAILY, action: "Updated", target: "Meta Sync",
      detail: `${since} → ${until} · ${m} daily rows · ${c.added} new + ${c.updated} updated campaigns`,
    });
  }
  return { ok: true, ...c, daily: m, errors };
}

/* ============================================================
   AUTO-SYNC — button dabaye bina data taaza rahe

   Panel khula ho to har kuch minute me chupchaap Meta se data aata
   hai (window neeche autoSyncNow me).

   Do tab khule hon to dono ek saath sync na karein — localStorage
   me 2 minute ka lock rakhte hain.
   ============================================================ */
const STATE_KEY = "vk_meta_sync_state";
const PREF_KEY = "vk_meta_autosync";
const LOCK_KEY = "vk_meta_sync_lock";

/* Sync ka haal shared database me bhi (system__sync-state) — ek computer
   ne abhi sync kiya ho to doosra dobara Meta ko nahi maangta, aur Meta
   ki limit ("wait 6 min") sabko pata chalti hai. */
const SHARED_STATE = "system__sync-state";
export function readSyncState() {
  let local = null;
  try { local = JSON.parse(window.localStorage.getItem(STATE_KEY) || "null"); } catch { local = null; }
  const shared = readRows(SHARED_STATE).find((r) => r.id === "meta") || null;
  if (!shared) return local;
  if (!local) return shared;
  const t = (x) => Date.parse(x?.at || 0) || 0;
  const pick = t(shared) > t(local) ? shared : local;
  const other = pick === shared ? local : shared;
  /* Meta ki "ruko" aur bade sync ka waqt — jo bhi aage ka ho */
  const later = (k) => ((Date.parse(pick[k] || 0) || 0) >= (Date.parse(other[k] || 0) || 0) ? pick[k] : other[k]);
  return { ...pick, backoffUntil: later("backoffUntil"), midAt: later("midAt"), fullAt: later("fullAt"), version: pick.version ?? other.version };
}
function saveSyncState(st) {
  try { window.localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* ignore */ }
  writeRows(SHARED_STATE, [{ id: "meta", ...st }]);
  window.dispatchEvent(new CustomEvent("vk-meta-sync-state", { detail: st }));
}

export const INTERVALS = [1, 2, 5, 10, 15, 30];
export function readAutoPref() {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREF_KEY) || "null");
    return { enabled: p?.enabled !== false, minutes: INTERVALS.includes(p?.minutes) ? p.minutes : 1 };
  } catch { return { enabled: true, minutes: 1 }; }
}
export function saveAutoPref(p) {
  try { window.localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function takeLock() {
  const now = Date.now();
  const cur = Number(window.localStorage.getItem(LOCK_KEY) || 0);
  if (cur && now - cur < 120000) return false;
  window.localStorage.setItem(LOCK_KEY, String(now));
  return true;
}
function dropLock() { window.localStorage.removeItem(LOCK_KEY); }

/* Meta ne rukne ko bola hai? (limit bhari) */
export function backoffLeft() {
  const st = readSyncState();
  const t = st?.backoffUntil ? Date.parse(st.backoffUntil) - Date.now() : 0;
  return t > 0 ? t : 0;
}

export function isStale(minutes) {
  const st = readSyncState();
  if (!st?.at) return true;
  return Date.now() - new Date(st.at).getTime() >= minutes * 60000;
}

export async function autoSyncNow({ force = false } = {}) {
  dedupeAccounts();
  const ids = panelMetaAccountIds();
  if (!ids.length) return { ok: false, skipped: "no-accounts" };
  if (!force && backoffLeft() > 0) return { ok: false, skipped: "backoff" };
  if (!takeLock()) return { ok: false, skipped: "locked" };
  try {
    /* Teen tarah ki window:
       · 90 din — pehli baar, naya account, ya formula upgrade
       · 30 din — din me ek baar. Meta 7-day click attribution ki wajah
         se purane din ke Results baad me badal deta hai; ye unhe pakadta hai
       · 8 din — baaki har baar (jaldi aata hai, quota kam khaata hai) */
    const daily = readRows(DAILY);
    const st = readSyncState() || {};
    const fresh = ids.some((id) => !daily.some((d) => d.account === id));
    const upgrade = st.version !== DATA_VERSION;
    const settle = !st.fullAt || Date.now() - new Date(st.fullAt).getTime() > 24 * 3600000;
    /* Har minute sirf aaj + kal (chhota, jaldi) · 15 min me 8 din ·
       din me ek baar 30 din · pehli baar 90 din */
    const mid = !st.midAt || Date.now() - new Date(st.midAt).getTime() > 15 * 60000;
    const days = fresh || upgrade ? 90 : settle ? 30 : mid ? 8 : 1;   // 1 = kal se aaj
    return await runMetaSync({
      accountIds: ids, since: isoAgo(days), until: isoAgo(0),
      quiet: !force, purge: upgrade, full: days >= 30,
    });
  } finally {
    dropLock();
  }
}
