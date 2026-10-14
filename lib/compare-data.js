/* ============================================================
   lib/compare-data.js — Comparison module ka hisaab

   Do sawaal ka jawab:
     1. Platform vs Platform — same time me FB, IG, YouTube, Website
        me kisne kitni leads di, kitne me, kitni convert hui
     2. Period vs Period — ek platform ka Jan vs Feb vs Mar ...

   Data kahan se:
     · Spend, impressions, clicks, Results  → campaigns__daily-stats
       (Meta sync + manual daily entries). Results = Ads Manager wala.
     · Converted (order mila)               → lead-capture__inbox-log,
       jis lead ka Stage "Converted" hai. Dashboard ka "Won" bhi yahi
       ginta hai — dono jagah ek hi number aaye.

   Leads (Results)     = Ads Manager wala number (daily-stats)
   Panel leads         = Lead Capture me aayi leads (Junk/Duplicate nahi)
   Converted           = un panel leads me se jinka Stage "Converted"
   Conversion %        = Converted ÷ Panel leads   ← dono ek hi data se
   Cost per conversion = Spend ÷ Converted

   Converted us din gina jaata hai jab lead AAYI thi (cohort) — taaki
   "Jan ki leads me se kitni convert hui" ka sahi jawab mile, chahe
   order Feb me bana ho.

   Jis period ka data hi nahi hai, use 0 nahi maante — "data nahi"
   dikhate hain. Warna "-100%" jaisi jhoothi giravat dikhti thi.
   ============================================================ */

import { readRows } from "./marketing-local";

export const PLATFORMS = [
  { key: "Facebook",  label: "Facebook",  color: "#1877F2", soft: "#E7F0FE", icon: "fa-brands fa-facebook-f" },
  { key: "Instagram", label: "Instagram", color: "#D62976", soft: "#FCE7F1", icon: "fa-brands fa-instagram" },
  { key: "Meta",      label: "Meta (FB + IG)", color: "#6D5DFC", soft: "#EEECFF", icon: "fa-brands fa-meta", members: ["Facebook", "Instagram", "MetaUnknown"] },
  { key: "YouTube",   label: "YouTube",   color: "#FF2D2D", soft: "#FDE8E8", icon: "fa-brands fa-youtube" },
  { key: "Website",   label: "Website",   color: "#0E9F8E", soft: "#E1F5F2", icon: "fa-solid fa-globe" },
  { key: "All",       label: "All combined", color: "#C99A2E", soft: "#FCF3DD", icon: "fa-solid fa-layer-group", members: ["Facebook", "Instagram", "MetaUnknown", "YouTube", "Website"] },
];
export const platformOf = (k) => PLATFORMS.find((p) => p.key === k) || PLATFORMS[0];
const membersOf = (k) => platformOf(k).members || [k];

/* Comparison me kaunse metric — kaunsa bada achha, kaunsa chhota */
export const METRICS = [
  { key: "spend",       label: "Amount spent",        fmt: "money2", better: "none" },
  { key: "results",     label: "Leads (Results)",     fmt: "count",  better: "high" },
  { key: "cpl",         label: "Cost per lead",       fmt: "money2", better: "low" },
  { key: "panelLeads",  label: "Leads reached panel", fmt: "count",  better: "high" },
  { key: "captureRate", label: "Ad lead → Panel %",   fmt: "pct",    better: "high" },
  { key: "converted",   label: "Converted",           fmt: "count",  better: "high" },
  { key: "convRate",    label: "Lead → Conversion %", fmt: "pct",    better: "high" },
  { key: "cpc",         label: "Cost per conversion", fmt: "money",  better: "low" },
  { key: "formLeads",   label: "Leads (Form)",        fmt: "count",  better: "high" },
  { key: "chats",       label: "WhatsApp / Msg chats", fmt: "count", better: "high" },
  { key: "impressions", label: "Impressions",         fmt: "count",  better: "high" },
  { key: "linkClicks",  label: "Link clicks",         fmt: "count",  better: "high" },
  { key: "ctr",         label: "CTR (link)",          fmt: "pct",    better: "high" },
  { key: "cpm",         label: "CPM",                 fmt: "money2", better: "low" },
  { key: "clickToLead", label: "Click → Lead %",      fmt: "pct",    better: "high" },
];
export const metricOf = (k) => METRICS.find((m) => m.key === k) || METRICS[0];

const n = (v) => { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; };

/* Lead Capture ka source → platform.
   "Meta" (haath se daali lead) ka pata nahi FB thi ya IG — use kisi ek
   me nahi daalte, sirf "Meta (FB + IG)" aur "Sab" me ginti hai.
   "Google" → YouTube, kyunki panel ka Google connection YouTube card hai. */
function leadPlatform(r) {
  const s = String(r.source || "").toLowerCase();
  if (s.includes("insta")) return "Instagram";
  if (s.includes("facebook")) return "Facebook";
  if (s === "meta") return "MetaUnknown";
  if (s.includes("youtube") || s.includes("google")) return "YouTube";
  if (s.includes("website") || s.includes("web")) return "Website";
  return "";
}

/* Saara raw data ek baar padho — page har change pe dobara na padhe */
export function loadData() {
  const daily = readRows("campaigns__daily-stats").map((d) => ({
    date: String(d.date || "").slice(0, 10),
    channel: String(d.channel || ""),
    spend: n(d.spend), results: n(d.results ?? d.leads), formLeads: n(d.formLeads), chats: n(d.chats),
    impressions: n(d.impressions), clicks: n(d.clicks), linkClicks: n(d.linkClicks),
  })).filter((d) => d.date);

  /* Panel ki leads — Junk / Duplicate nahi ginte */
  const leads = readRows("lead-capture__inbox-log")
    .filter((r) => !["junk", "duplicate"].includes(String(r.flag || "").toLowerCase()))
    .map((r) => ({
      date: String(r.receivedAt || "").slice(0, 10),
      channel: leadPlatform(r),
      converted: String(r.stage || "").toLowerCase() === "converted",
    }))
    .filter((r) => r.date && r.channel);
  const conv = leads.filter((l) => l.converted);

  const dDates = daily.map((d) => d.date).sort();
  const lDates = leads.map((l) => l.date).sort();
  const all = dDates.concat(lDates).sort();
  return {
    daily, leads, conv,
    first: all[0] || "", last: all[all.length - 1] || "",
    /* kab se kaunsa data hai — isse pehle ka period "data nahi" */
    adsFirst: dDates[0] || "", leadsFirst: lDates[0] || "",
    unknownMeta: leads.filter((l) => l.channel === "MetaUnknown").length,
  };
}

/* Ek platform + ek date range ke saare numbers */
export function aggregate(data, platformKey, from, to) {
  const mem = membersOf(platformKey);
  const inR = (d) => (!from || d >= from) && (!to || d <= to);
  const t = { spend: 0, results: 0, formLeads: 0, chats: 0, impressions: 0, clicks: 0, linkClicks: 0, converted: 0, days: 0 };
  const days = new Set();
  data.daily.forEach((d) => {
    if (!mem.includes(d.channel) || !inR(d.date)) return;
    t.spend += d.spend; t.results += d.results; t.formLeads += d.formLeads; t.chats += d.chats;
    t.impressions += d.impressions; t.clicks += d.clicks; t.linkClicks += d.linkClicks;
    days.add(d.date);
  });
  t.panelLeads = 0;
  data.leads.forEach((l) => {
    if (!mem.includes(l.channel) || !inR(l.date)) return;
    t.panelLeads += 1;
    if (l.converted) t.converted += 1;
  });
  t.days = days.size;
  t.spend = Math.round(t.spend * 100) / 100;
  /* Kharch 0 ho to "₹0 per lead" nahi — wo jhootha "sabse sasta" lagta.
     0 = "—" (koi data nahi) */
  t.cpl = t.spend > 0 && t.results ? t.spend / t.results : 0;
  t.convRate = t.panelLeads ? (t.converted / t.panelLeads) * 100 : 0;
  /* Ads Manager ki kitni leads sach me panel (Lead Capture) tak aayi —
     ye kam ho to conversion % pe bharosa kam karo */
  t.captureRate = t.results ? Math.min(100, (t.panelLeads / t.results) * 100) : 0;
  t.cpc = t.spend > 0 && t.converted ? t.spend / t.converted : 0;
  t.ctr = t.impressions ? (t.linkClicks / t.impressions) * 100 : 0;
  t.cpm = t.spend > 0 && t.impressions ? (t.spend / t.impressions) * 1000 : 0;
  t.clickToLead = t.linkClicks ? (t.results / t.linkClicks) * 100 : 0;
  return t;
}

/* ---------- mahine ---------- */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MON[m - 1]} ${String(y).slice(2)}`;
}
export function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${key}-01`, `${key}-${String(last).padStart(2, "0")}`];
}
/* Aaj se peeche N mahine (sabse purana pehle) */
export function lastMonths(count) {
  const out = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
/* Data me jo mahine hain */
export function monthsInData(data) {
  const s = new Set(data.daily.map((d) => d.date.slice(0, 7)).concat(data.conv.map((c) => c.date.slice(0, 7))));
  return [...s].sort();
}
/* Chalu mahina adhoora hai — comparison me ye batana zaroori hai */
export function isPartialMonth(key) {
  const now = new Date();
  return key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ---------- date presets ---------- */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const RANGES = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All data" },
  { key: "custom", label: "Custom" },
];
export function resolve(range, from, to) {
  const now = new Date();
  if (range === "this-month") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
  if (range === "last-month") return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (["7", "30", "90"].includes(range)) {
    const a = new Date(now); a.setDate(a.getDate() - (Number(range) - 1));
    return [iso(a), iso(now)];
  }
  if (range === "custom") return [from || "", to || ""];
  return ["", ""];
}

/* Badlaav % — pichle ke muqable */
export function delta(cur, prev) {
  if (!prev) return cur ? null : 0;   // null = "naya"
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/* Kaun jeeta — metric ke hisaab se (CPL me kam achha) */
export function winnerOf(values, better) {
  if (better === "none") return -1;
  const valid = values.map((v, i) => [v, i]).filter(([v]) => v > 0);
  if (valid.length < 2) return -1;
  valid.sort((a, b) => (better === "low" ? a[0] - b[0] : b[0] - a[0]));
  /* Barabari (0.05% ke andar) — kisi ko jeet nahi */
  const [a, b] = [valid[0][0], valid[1][0]];
  if (Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.0005) return -1;
  return valid[0][1];
}

/* Is period ka data hai bhi? Pehli entry ke baad shuru hua period hi
   "poora" hai. Pehle ka → "data nahi", beech se shuru → "adhoora". */
export function coverage(data, from, to) {
  const first = data.adsFirst || data.leadsFirst;
  if (!first) return "none";
  if (to && to < first) return "none";
  if (from && from < first) return "partial";
  if (!from) return "full";
  return "full";
}
