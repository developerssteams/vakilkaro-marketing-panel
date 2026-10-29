/* ============================================================
   lib/website-pull.js — BROWSER

   Website ki leads (Hostinger MySQL: enquiries, contact_messages,
   odr_disputes) panel me laata hai:
   1. Lead Capture me — source "Website", campaign = kaunsa form
   2. Campaigns → Website card ke liye har din ki ginti
      (daily stats me channel "Website", kharch 0)

   Har row ki pakki id (wl-… / wd-…), isliye do computer ek saath
   laayein to bhi duplicate nahi. Har 5 minute (auto-sync ke saath).
   ============================================================ */
import { readRows, writeRows, logActivity } from "./marketing-local";

const LEADS = "lead-capture__inbox-log";
const DAILY = "campaigns__daily-stats";
const AT = "vk_web_leads_at";
const ERR = "vk_web_leads_err";
/* v2: website ka waqt IST me (pehle 5:30 ghante aage dikhta tha) — ek baar
   saari leads dobara laake purani leads ka time theek karte hain */
const VER = "vk_web_leads_v";
const VERSION = "2";
const EVERY = 5 * 60000;

const get = (k) => { try { return window.localStorage.getItem(k) || ""; } catch { return ""; } };
const put = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* */ } };

/* UTC time → IST din (YYYY-MM-DD) */
function istDay(isoStr) {
  const t = Date.parse(isoStr || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function pullWebsiteLeads({ quiet = false, force = false } = {}) {
  const upgrade = get(VER) !== VERSION;
  const lastAt = Date.parse(get(AT) || 0) || 0;
  if (!force && Date.now() - lastAt < EVERY) return { ok: true, skipped: true };
  const last = upgrade ? 0 : lastAt;
  /* Pehli baar sab, baad me pichhle pull se 2 din peeche se */
  const since = last ? new Date(last - 2 * 86400000).toISOString() : "2000-01-01T00:00:00Z";

  const res = await fetch("/api/leads/website-db", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since }),
  });
  const data = await res.json().catch(() => ({}));
  /* Galti ho to Audit log me likho (wahi galti baar-baar nahi) aur 5 min baad dobara */
  const fail = (msg) => {
    put(AT, new Date().toISOString());
    if (get(ERR) !== msg || !quiet) {
      put(ERR, msg);
      logActivity({ dataset: LEADS, action: "Failed", target: "Website Lead Sync", detail: msg });
    }
    return { ok: false, error: msg };
  };
  if (res.status === 404) return fail("Website leads route not found — app/api/leads/website-db/route.js is missing. Add the file and restart the server.");
  if (data.configured === false) return fail("Website database is not set — add WEBSITE_DB_HOST, WEBSITE_DB_NAME, WEBSITE_DB_USER, WEBSITE_DB_PASSWORD in .env.local / Vercel and restart.");
  if (!res.ok || data.ok === false) return fail(data.error || `Could not load website leads (HTTP ${res.status})`);
  put(ERR, "");

  let rows = readRows(LEADS);
  const seenExt = new Set(rows.map((r) => r.extId).filter(Boolean));
  const seenPhone = new Set(rows.map((r) => String(r.phone || "").replace(/\D/g, "").slice(-10)).filter(Boolean));
  const add = [];
  /* Pehle se aayi lead ka waqt galat ho to theek karo (sirf time) */
  const byExt = new Map((data.leads || []).filter((l) => l.extId).map((l) => [l.extId, l]));
  let fixed = 0;
  rows = rows.map((r) => {
    const l = r.extId && byExt.get(r.extId);
    if (!l || !l.createdAt || r.receivedTime === l.createdAt) return r;
    fixed += 1;
    return { ...r, receivedTime: l.createdAt, receivedAt: istDay(l.createdAt) };
  });
  (data.leads || []).forEach((l) => {
    if (!l.extId || seenExt.has(l.extId)) return;
    seenExt.add(l.extId);
    const dup = l.phone && seenPhone.has(l.phone);
    add.push({
      id: `wl-${l.extId}`, extId: l.extId,
      name: l.name || "—", phone: l.phone, email: l.email || "", city: l.city || "", state: "",
      service: l.service || "", source: "Website", campaign: `Website · ${l.form}`, adName: "", formId: l.table,
      account: "", message: l.message || "", pageUrl: l.pageUrl || "",
      receivedAt: istDay(l.createdAt), receivedTime: l.createdAt || "",
      flag: dup ? "Duplicate" : "Clean", stage: "New", status: "Received",
      createdAt: new Date().toISOString(),
    });
    if (l.phone) seenPhone.add(l.phone);
  });
  if (add.length || fixed) {
    rows = [...add, ...rows];
    writeRows(LEADS, rows);
  }

  /* Website card — har din kitni website leads (kharch 0) */
  const perDay = {};
  rows.forEach((r) => {
    if (r.source !== "Website" || !String(r.extId || "").startsWith("web-")) return;
    const d = r.receivedAt || istDay(r.receivedTime);
    if (d) perDay[d] = (perDay[d] || 0) + 1;
  });
  const daily = readRows(DAILY);
  const old = new Map(daily.filter((d) => d.source === "Website DB").map((d) => [d.date, d]));
  const changed = Object.keys(perDay).some((d) => String(old.get(d)?.leads) !== String(perDay[d]))
    || [...old.keys()].some((d) => !perDay[d]);
  if (changed) {
    const now = new Date().toISOString();
    const web = Object.entries(perDay).map(([date, n]) => {
      const o = old.get(date);
      return {
        id: `wd-${date}`, date, campaign: "Website forms", channel: "Website", account: "", extId: "",
        spend: "0", leads: String(n), results: String(n), resultLabel: "Website leads",
        formLeads: String(n), chats: "0", impressions: "0", clicks: "0", linkClicks: "0",
        source: "Website DB", createdAt: o?.createdAt || now, updatedAt: String(o?.leads) === String(n) ? (o?.updatedAt || now) : now,
      };
    });
    writeRows(DAILY, [...daily.filter((d) => d.source !== "Website DB"), ...web].sort((a, b) => (a.date < b.date ? 1 : -1)));
  }

  put(AT, new Date().toISOString());
  put(VER, VERSION);
  if (add.length || !quiet) {
    logActivity({ dataset: LEADS, action: "Created", target: "Website Lead Sync", detail: `${add.length} new website leads (enquiries ${data.counts?.enquiries ?? 0} · contact ${data.counts?.contact_messages ?? 0} · ODR ${data.counts?.odr_disputes ?? 0})` });
  }
  return { ok: true, added: add.length, errors: data.errors || [] };
}