"use client";

/* ============================================================
   components/GrowthDashboard.js — Dashboard (sabka overview)

   Upar se neeche, aasaan bhasha me:
     1. Greeting (login karne wale ka naam) + aaj ka snapshot
     2. Sticky bar — sections pe jump + period picker
     3. "What you should know" — panel khud data padh ke 4 seedhi baatein
     4. Paisa & results — 6 cards, pichhle period se tulna
     5. Spend graph · Facebook vs Instagram
     6. Lead sources · Leads kab aati hain
     7. Top campaigns · Service-wise leads
     8. Har module ka card
   Data wahi jo panel already sync karta hai — koi naya API call nahi.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { DATASETS } from "../lib/marketing-config";
import { readRows } from "../lib/marketing-local";
import { prepaidBalances } from "../lib/meta-pull";
import { OBJECTIVES, objectiveOf, objectiveFromResult } from "../lib/objectives";

/* ---------- helpers ---------- */
const n = (v) => { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; };
const inr = (v, d = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: d, minimumFractionDigits: d }).format(n(v));
const num = (v) => new Intl.NumberFormat("en-IN").format(Math.round(n(v)));
function compact(v, money = false) {
  const x = Math.abs(n(v)); const s = n(v) < 0 ? "-" : ""; const p = money ? "₹" : "";
  if (x >= 1e7) return `${s}${p}${(x / 1e7).toFixed(x >= 1e8 ? 0 : 1)}Cr`;
  if (x >= 1e5) return `${s}${p}${(x / 1e5).toFixed(x >= 1e6 ? 0 : 1)}L`;
  if (x >= 1e3) return `${s}${p}${(x / 1e3).toFixed(x >= 1e4 ? 0 : 1)}K`;
  return `${s}${p}${Math.round(x)}`;
}
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const z = (k) => String(k).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WDL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const short = (iso) => { const [, m, d] = String(iso).split("-").map(Number); return m ? `${d} ${MON[m - 1]}` : ""; };
const hr = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

function toDate(t) {
  if (!t) return null;
  const d = new Date(String(t).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}

const RANGES = [
  { key: "today", label: "Today", long: "Today", words: "today", prev: "yesterday" },
  { key: "7", label: "7 days", long: "Last 7 days", words: "the last 7 days", prev: "the 7 days before" },
  { key: "30", label: "30 days", long: "Last 30 days", words: "the last 30 days", prev: "the 30 days before" },
  { key: "month", label: "This month", long: "This month", words: "this month", prev: "the same days last month" },
  { key: "90", label: "90 days", long: "Last 90 days", words: "the last 90 days", prev: "the 90 days before" },
];

function rangeDates(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let from = new Date(now);
  if (key === "7") from.setDate(from.getDate() - 6);
  else if (key === "30") from.setDate(from.getDate() - 29);
  else if (key === "90") from.setDate(from.getDate() - 89);
  else if (key === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = Math.round((now - from) / 864e5) + 1;
  const pTo = new Date(from); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - (days - 1));
  const list = [];
  for (let d = new Date(from); d <= now; d.setDate(d.getDate() + 1)) list.push(day(d));
  return { from: day(from), to: day(now), pFrom: day(pFrom), pTo: day(pTo), list, days };
}

/* Categorical — fixed order (validated). FB/IG apne brand rang. */
const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const FB = "#1877F2"; const IG = "#D62976";
const GOLD = "#E8A81C"; const BLUE = "#2a78d6"; const GREEN = "#1baf7a";

/* ---------- hooks ---------- */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function useCountUp(target, ms = 1000) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setV(target); return undefined; }
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

/* Smooth line (monotone cubic) — curve kabhi data se upar/neeche nahi bhaagti */
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const dx = []; const dy = []; const m = [];
  for (let i = 0; i < pts.length - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); dy.push(pts[i + 1][1] - pts[i][1]); m.push(dy[i] / (dx[i] || 1)); }
  const t = [m[0]];
  for (let i = 1; i < pts.length - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[m.length - 1]);
  for (let i = 0; i < m.length; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i]; const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}
/* Axis max jo 4 barabar hisso me saaf number de (0, 50, 100, 150, 200) */
function niceAxis(v) {
  const step = niceMax(Math.max(v, 1) / 4);
  return step * 4;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* ============================================================ */
export default function GrowthDashboard({ userName = "" }) {
  const [d, setD] = useState(null);
  const [range, setRange] = useState("30");
  const [stamp, setStamp] = useState(null);
  const [prepaid, setPrepaid] = useState(null);
  const [obj, setObj] = useState("");   /* Results / Cost per result kis objective ke — "" = sab */

  useEffect(() => {
    try { const r = localStorage.getItem("vk_dash_range"); if (r && RANGES.some((x) => x.key === r)) setRange(r); } catch { /* */ }
    const load = () => {
      const next = {};
      Object.entries(DATASETS).forEach(([alias, key]) => { next[alias] = readRows(key); });
      setD(next); setStamp(new Date());
      const b = Object.values(prepaidBalances() || {}).map((x) => x?.prepaid).filter((x) => typeof x === "number");
      setPrepaid(b.length ? b.reduce((a, x) => a + x, 0) : null);
    };
    load();
    window.addEventListener("vk-marketing-updated", load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener("vk-marketing-updated", load); window.removeEventListener("storage", load); };
  }, []);
  const pickRange = (k) => { setRange(k); try { localStorage.setItem("vk_dash_range", k); } catch { /* */ } };

  const R = useMemo(() => rangeDates(range), [range]);
  const RW = RANGES.find((x) => x.key === range);

  const m = useMemo(() => {
    if (!d) return null;
    const inR = (x) => x >= R.from && x <= R.to;
    const inP = (x) => x >= R.pFrom && x <= R.pTo;

    /* --- Meta daily (Campaigns) --- */
    const daily = (d.dailyStats || []).filter((r) => r.date);
    const blank = () => ({ spend: 0, results: 0, form: 0, chats: 0, impr: 0, clicks: 0, fbSpend: 0, igSpend: 0, fbRes: 0, igRes: 0 });
    const byDay = {}; R.list.forEach((x) => { byDay[x] = { ...blank(), leads: 0 }; });
    const cur = blank(); const prev = blank();
    const camp = {};
    daily.forEach((r) => {
      const dt = String(r.date).slice(0, 10);
      const a = inR(dt); const b = inP(dt);
      if (!a && !b) return;
      const t = a ? cur : prev;
      const sp = n(r.spend); const res = n(r.results ?? r.leads);
      t.spend += sp; t.results += res; t.form += n(r.formLeads); t.chats += n(r.chats);
      t.impr += n(r.impressions); t.clicks += n(r.linkClicks || r.clicks);
      if (r.channel === "Instagram") { t.igSpend += sp; t.igRes += res; } else { t.fbSpend += sp; t.fbRes += res; }
      if (a) {
        const bd = byDay[dt]; if (bd) { bd.spend += sp; bd.results += res; }
        const k = r.campaign || "Unnamed";
        camp[k] = camp[k] || { name: k, spend: 0, results: 0, form: 0, chats: 0 };
        camp[k].spend += sp; camp[k].results += res; camp[k].form += n(r.formLeads); camp[k].chats += n(r.chats);
      }
    });

    /* --- Leads (Lead Capture) --- */
    const inbox = d.inbox || [];
    const lDay = (r) => String(r.receivedAt || r.createdAt || "").slice(0, 10);
    const leadsCur = inbox.filter((r) => inR(lDay(r)));
    const leadsPrev = inbox.filter((r) => inP(lDay(r)));
    const conv = (rows) => rows.filter((r) => String(r.stage || "").toLowerCase() === "converted").length;
    leadsCur.forEach((r) => { const bd = byDay[lDay(r)]; if (bd) bd.leads += 1; });
    const src = {}; const svc = {};
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    leadsCur.forEach((r) => {
      const s = r.source || "Other"; src[s] = (src[s] || 0) + 1;
      const v = r.service || "Not set"; svc[v] = (svc[v] || 0) + 1;
      const t = toDate(r.receivedTime);
      if (t) heat[(t.getDay() + 6) % 7][t.getHours()] += 1;
    });
    const srcList = Object.entries(src).sort((a, b) => b[1] - a[1]);
    const srcTop = srcList.slice(0, 5);
    const srcOther = srcList.slice(5).reduce((a, x) => a + x[1], 0);
    if (srcOther) srcTop.push(["Other", srcOther]);
    let busy = null;
    heat.forEach((row, di) => row.forEach((v, h) => { if (v && (!busy || v > busy.v)) busy = { d: di, h, v }; }));

    /* --- Wallet (Meta billing) --- */
    const ledger = d.walletLedger || [];
    const paid = (from, to) => ledger.filter((r) => r.type === "Credit" && String(r.date || "") >= from && String(r.date || "") <= to).reduce((a, r) => a + n(r.amount), 0);
    const lastPay = ledger.filter((r) => r.type === "Credit").sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

    /* --- Accounts / campaigns / remarketing --- */
    const accounts = (d.accounts || []).filter((a) => a.platform === "Meta");
    const ads = d.liveAds || [];
    const pool = (d.lostPool || []).filter((r) => !["recovered", "archived"].includes(String(r.status).toLowerCase()));
    const queue = d.queue || [];
    const recovered = d.recovered || [];
    const bcast = d.broadcast || [];
    const camps = Object.values(camp).sort((a, b) => b.spend - a.spend);

    return {
      cur, prev, series: R.list.map((x) => ({ date: x, ...byDay[x] })),
      leads: leadsCur.length, leadsPrev: leadsPrev.length,
      conv: conv(leadsCur), convPrev: conv(leadsPrev),
      dup: leadsCur.filter((r) => r.flag === "Duplicate").length,
      paid: paid(R.from, R.to), paidPrev: paid(R.pFrom, R.pTo), lastPay,
      src: srcTop, svc: Object.entries(svc).sort((a, b) => b[1] - a[1]).slice(0, 6), heat, busy,
      camps: camps.slice(0, 6),
      bestCamp: camps.filter((c) => c.results >= 10).sort((a, b) => a.spend / a.results - b.spend / b.results)[0] || null,
      accounts, problems: accounts.filter((a) => a.problem),
      unbilled: accounts.reduce((a, x) => a + n(x.balance), 0),
      lifetime: accounts.reduce((a, x) => a + n(x.amountSpent), 0),
      adsActive: ads.filter((r) => String(r.status) === "Active").length,
      adsPaused: ads.filter((r) => String(r.status) === "Paused").length,
      pool: pool.length, due: queue.filter((r) => String(r.status) === "Queued").length,
      recovered: recovered.length, recValue: recovered.reduce((a, r) => a + n(r.orderValue), 0),
      sent: bcast.reduce((a, r) => a + n(r.sent), 0), replies: bcast.reduce((a, r) => a + n(r.replies), 0),
      segments: (d.segments || []).length,
      todayLeads: inbox.filter((r) => lDay(r) === day(new Date())).length,
      todaySpend: daily.filter((r) => String(r.date).slice(0, 10) === day(new Date())).reduce((a, r) => a + n(r.spend), 0),
      todayResults: daily.filter((r) => String(r.date).slice(0, 10) === day(new Date())).reduce((a, r) => a + n(r.results ?? r.leads), 0),
      totalLeads: inbox.length,
    };
  }, [d, R]);

  /* Results + Cost per result — objective ke hisaab se (Leads, Calls, Messages…).
     Har daily row ka objective uske campaign se; campaign na mile to result ke type se. */
  const om = useMemo(() => {
    if (!d) return null;
    const byExt = new Map(); const byName = new Map();
    (d.liveAds || []).forEach((c) => {
      const o = objectiveOf(c);
      if (c.extId) byExt.set(String(c.extId), o);
      if (c.name) byName.set(String(c.name).toLowerCase(), o);
    });
    const objOf = (r) => (r.extId && byExt.get(String(r.extId))) || byName.get(String(r.campaign || "").toLowerCase()) || objectiveFromResult(r.resultLabel) || "";
    const inR = (x) => x >= R.from && x <= R.to;
    const inP = (x) => x >= R.pFrom && x <= R.pTo;
    const blank = () => ({ spend: 0, results: 0, form: 0, chats: 0 });
    const cur = blank(); const prev = blank(); const counts = {};
    const byDay = {}; R.list.forEach((x) => { byDay[x] = 0; });
    (d.dailyStats || []).forEach((r) => {
      if (!r.date) return;
      const dt = String(r.date).slice(0, 10);
      const a = inR(dt); const b = inP(dt);
      if (!a && !b) return;
      const o = objOf(r);
      if (a && o) counts[o] = (counts[o] || 0) + 1;
      if (obj && o !== obj) return;
      const t = a ? cur : prev;
      const res = n(r.results ?? r.leads);
      t.spend += n(r.spend); t.results += res; t.form += n(r.formLeads); t.chats += n(r.chats);
      if (a && dt in byDay) byDay[dt] += res;
    });
    return { cur, prev, counts, series: R.list.map((x) => byDay[x]) };
  }, [d, R, obj]);

  if (!m) return <div className="gd"><div className="gd-skel" /></div>;

  const cpr = m.cur.results ? m.cur.spend / m.cur.results : 0;
  const cprPrev = m.prev.results ? m.prev.spend / m.prev.results : 0;
  const fbCpr = m.cur.fbRes ? m.cur.fbSpend / m.cur.fbRes : 0;
  const igCpr = m.cur.igRes ? m.cur.igSpend / m.cur.igRes : 0;
  const noMeta = !m.cur.spend && !m.prev.spend && !m.series.some((s) => s.results);
  const hello = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();
  /* Login karne wale ka pehla naam — "Rahul Sharma" → "Rahul" */
  const first = String(userName || "").trim().split(/\s+/)[0] || "";
  const initials = String(userName || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const capture = pct(m.leads, m.cur.form || m.cur.results);

  /* ---------- "What you should know" — sabse zaroori pehle ---------- */
  const insights = [];
  m.problems.forEach((p) => insights.push({ tone: "bad", icon: "fa-triangle-exclamation", title: `${p.name} needs attention`, text: p.problem, href: "/ad-accounts", cta: "Fix in Ad Accounts" }));
  /* Tulna tabhi jab dono taraf kaafi results hon — warna aaj subah ke
     2 results se "100% sasta" jaisi galat baat ban jaati hai */
  if (cpr && cprPrev && m.cur.results >= 10 && m.prev.results >= 10 && m.cur.spend >= 500) {
    const ch = pct(cpr - cprPrev, cprPrev);
    if (Math.abs(ch) >= 3 && Math.abs(ch) <= 80) insights.push(ch < 0
      ? { tone: "good", icon: "fa-arrow-trend-down", title: `Cost per result is ${Math.abs(ch).toFixed(0)}% lower`, text: `${inr(cprPrev, 2)} → ${inr(cpr, 2)} compared with ${RW.prev}. Ads are getting cheaper.` }
      : { tone: "warn", icon: "fa-arrow-trend-up", title: `Cost per result is ${ch.toFixed(0)}% higher`, text: `${inr(cprPrev, 2)} → ${inr(cpr, 2)} compared with ${RW.prev}. Check the costliest campaigns below.`, href: "/campaigns", cta: "Open Campaigns" });
  }
  if (fbCpr && igCpr && m.cur.fbRes >= 10 && m.cur.igRes >= 10 && m.cur.fbSpend >= 300 && m.cur.igSpend >= 300) {
    const cheap = fbCpr <= igCpr ? "Facebook" : "Instagram";
    const diff = Math.abs(pct(fbCpr - igCpr, Math.max(fbCpr, igCpr)));
    insights.push({ tone: "info", icon: cheap === "Facebook" ? "fa-brands fa-facebook-f" : "fa-brands fa-instagram", title: diff < 3 ? "Facebook and Instagram cost the same" : `${cheap} is ${diff.toFixed(0)}% cheaper per result`, text: `Facebook ${inr(fbCpr, 2)} vs Instagram ${inr(igCpr, 2)} per result.`, href: "/comparison", cta: "Compare" });
  }
  if ((m.cur.form || m.cur.results) && m.leads) {
    insights.push(capture >= 85
      ? { tone: "good", icon: "fa-circle-check", title: `${capture.toFixed(0)}% of form leads reached the panel`, text: `${num(m.leads)} of ${num(m.cur.form || m.cur.results)} — Lead Capture is in sync with Meta.` }
      : { tone: "warn", icon: "fa-user-clock", title: `Only ${capture.toFixed(0)}% of form leads reached the panel`, text: `${num(m.leads)} in panel vs ${num(m.cur.form || m.cur.results)} form leads in Ads Manager.`, href: "/lead-capture", cta: "Match with Ads Manager" });
  }
  if (m.bestCamp) insights.push({ tone: "good", icon: "fa-trophy", title: `Best campaign: ${m.bestCamp.name}`, text: `Cheapest at ${inr(m.bestCamp.spend / m.bestCamp.results, 2)} per result (${num(m.bestCamp.results)} results).`, href: "/campaigns", cta: "See ads" });
  if (m.busy) insights.push({ tone: "info", icon: "fa-clock", title: `Most leads arrive ${WDL[m.busy.d]} around ${hr(m.busy.h)}`, text: "Keep callers free at this time to reply fastest." });
  if (!insights.length) insights.push({ tone: "info", icon: "fa-circle-info", title: "Nothing urgent", text: "Sync Meta and pull leads to see insights here." });

  const spark = (k) => m.series.map((s) => s[k]);

  return (
    <div className="gd" key={range}>
      {/* ---------- HERO — naam ke saath greeting + aaj ka snapshot ---------- */}
      <section className="gd-hero">
        <div className="gd-hero-l">
          <div className="gd-hello">
            <span className="gd-ava" aria-hidden="true">{initials || <i className="fa-solid fa-user" />}</span>
            <div>
              <span className="gd-today">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              <h1>{hello}{first ? <>, <em>{first}</em></> : null} <span className="gd-wave">👋</span></h1>
            </div>
          </div>
          <p>
            {m.cur.spend > 0
              ? <>In {RW.words} you spent <b>{inr(m.cur.spend)}</b> on Meta ads, got <b>{num(m.cur.results)}</b> results and <b>{num(m.leads)}</b> leads came into the panel{m.conv ? <> — <b>{num(m.conv)}</b> became clients</> : null}.</>
              : <>Your marketing at a glance — Campaigns, Leads, Ad Wallet and Reports in one place.</>}
          </p>
        </div>
        <div className="gd-snap">
          <span className="gd-snap-t"><span className="gd-live" /> Today so far</span>
          <div className="gd-snap-g">
            <a href="/lead-capture" className="gd-snap-i"><span className="gd-snap-ic t-green"><i className="fa-solid fa-user-plus" /></span><b>{num(m.todayLeads)}</b><small>new leads</small></a>
            <a href="/campaigns" className="gd-snap-i"><span className="gd-snap-ic t-gold"><i className="fa-solid fa-indian-rupee-sign" /></span><b>{compact(m.todaySpend, true)}</b><small>ad spend</small></a>
            <a href="/campaigns" className="gd-snap-i"><span className="gd-snap-ic t-blue"><i className="fa-solid fa-bullseye" /></span><b>{num(m.todayResults)}</b><small>results</small></a>
            <a href="/ad-wallet" className="gd-snap-i"><span className="gd-snap-ic t-rose"><i className="fa-solid fa-wallet" /></span><b>{prepaid != null ? compact(prepaid, true) : "—"}</b><small>ad balance</small></a>
          </div>
        </div>
      </section>

      {/* ---------- STICKY BAR — sections + period ---------- */}
      <div className="gd-bar">
        <nav className="gd-jump" aria-label="Sections">
          {[["gd-s-know", "Insights", "fa-lightbulb"], ["gd-s-money", "Money", "fa-indian-rupee-sign"], ["gd-s-spend", "Spend", "fa-chart-area"], ["gd-s-leads", "Leads", "fa-user-plus"], ["gd-s-camp", "Campaigns", "fa-ranking-star"], ["gd-s-mods", "Modules", "fa-grip"]].map(([id, label, ic]) => (
            <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><i className={`fa-solid ${ic}`} /><span>{label}</span></a>
          ))}
        </nav>
        <Period range={range} R={R} RW={RW} stamp={stamp} onPick={pickRange} />
      </div>

      {/* ---------- INSIGHTS ---------- */}
      <section className="gd-block" id="gd-s-know">
        <SecHead n="01" icon="fa-lightbulb" title="What you should know" sub={`Read from your data for ${RW.words}`} />
        <div className="gd-ins">
          {insights.slice(0, 4).map((x, i) => (
            <div key={i} className={`gd-in tone-${x.tone}`} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="gd-in-ic"><i className={x.icon.startsWith("fa-brands") ? x.icon : `fa-solid ${x.icon}`} /></span>
              <div className="gd-in-b">
                <b>{x.title}</b>
                <p>{x.text}</p>
                {x.href ? <a href={x.href}>{x.cta} <i className="fa-solid fa-arrow-right" /></a> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {noMeta ? (
        <div className="gd-empty-cta">
          <i className="fa-brands fa-meta" />
          <div><b>No Meta data for this range yet</b><span>Connect an ad account — the panel then syncs it automatically.</span></div>
          <a href="/ad-accounts" className="gd-btn">Connect Meta</a>
        </div>
      ) : null}

      {/* ---------- KPI ---------- */}
      <section className="gd-block" id="gd-s-money">
        <SecHead n="02" icon="fa-indian-rupee-sign" title="Money & results" sub={`Each card compares with ${RW.prev}`} />
        <div className="gd-kpis">
          <Kpi icon="fa-indian-rupee-sign" tone="gold" label="Amount spent" help="Total paid to Meta for ads in this period (Facebook + Instagram)."
            value={m.cur.spend} fmt={(v) => inr(v)} prev={m.prev.spend} spark={spark("spend")} goodWhen="neutral" sub={`${inr(m.cur.spend / Math.max(1, R.days))} per day on average`} />
          <Kpi icon="fa-bullseye" tone="blue" label="Results"
            action={(
              /* Objective dropdown — Results aur Cost per result isi ke hisaab se */
              <label title="Results and cost for this objective" style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
                <select value={obj} onChange={(e) => setObj(e.target.value)} aria-label="Objective"
                  style={{ appearance: "none", WebkitAppearance: "none", height: 30, padding: "0 26px 0 10px", borderRadius: 9, border: `1px solid ${obj ? "#E8A81C" : "#E3E6EF"}`, background: obj ? "#FFFBF0" : "#fff", font: "700 12px var(--font)", color: "#1B2333", cursor: "pointer", width: "100%" }}>
                  <option value="">All objectives</option>
                  {OBJECTIVES.map((o) => <option key={o.key} value={o.key}>{o.key}{om?.counts[o.key] ? "" : " (no data)"}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down" style={{ position: "absolute", right: 9, fontSize: 9, color: "#959CAE", pointerEvents: "none" }} />
              </label>
            )}
            help="Same as the Results column in Ads Manager — form leads plus WhatsApp/Messenger chats. Use the objective buttons above to see one objective."
            value={om.cur.results} fmt={num} prev={om.prev.results} spark={om.series} sub={`${num(om.cur.form)} form leads · ${num(om.cur.chats)} chats${obj ? ` · ${inr(om.cur.spend)} spent` : ""}`} />
          <Kpi icon="fa-tag" tone="violet" label={obj === "Leads" ? "Cost per lead" : obj === "Calls" ? "Cost per call" : obj === "Messages" ? "Cost per chat" : obj ? `Cost per result · ${obj}` : "Cost per result"} help="Amount spent ÷ results (of the chosen objective). Lower is better."
            value={om.cur.results ? om.cur.spend / om.cur.results : 0} fmt={(v) => (v ? inr(v, 2) : "—")} prev={om.prev.results ? om.prev.spend / om.prev.results : 0} goodWhen="down" sub={obj ? `${inr(om.cur.spend)} ÷ ${num(om.cur.results)} ${obj.toLowerCase()}` : "Lower is better"} />
          <Kpi icon="fa-user-plus" tone="green" label="Leads in panel" help="Leads that actually reached Lead Capture (with name and phone)."
            value={m.leads} fmt={num} prev={m.leadsPrev} spark={spark("leads")} sub={`${num(m.todayLeads)} today · ${num(m.dup)} duplicates`} />
          <Kpi icon="fa-handshake" tone="aqua" label="Clients won" help="Leads whose stage is “Converted”."
            value={m.conv} fmt={num} prev={m.convPrev} sub={m.leads ? `${pct(m.conv, m.leads).toFixed(1)}% of leads became clients` : "Mark a lead “Converted” to count it"} />
          <Kpi icon="fa-wallet" tone="rose" label="Paid to Meta" help="Payments Meta charged to your card in this period (from Ad Wallet)."
            value={m.paid} fmt={(v) => inr(v)} prev={m.paidPrev} goodWhen="neutral" sub={m.lastPay ? `Last payment ${inr(m.lastPay.amount)} on ${short(String(m.lastPay.date).slice(0, 10))}` : "No payments synced yet"} />
        </div>
      </section>

      {/* ---------- SPEND ---------- */}
      <section className="gd-block" id="gd-s-spend">
        <SecHead n="03" icon="fa-chart-area" title="Where the money went" sub="Daily spend and which platform gives cheaper results" />
        <div className="gd-grid gd-grid-main">
          <Card title="Daily ad spend" icon="fa-chart-area" tone="gold" sub="How much went to Meta each day — hover a day for details" href="/campaigns"
            stat={<><b>{inr(m.cur.spend)}</b><span>total</span></>}>
            <AreaChart data={m.series} />
          </Card>
          <Card title="Facebook vs Instagram" icon="fa-scale-balanced" tone="blue" sub="Where the money went and which is cheaper" href="/comparison">
            <PlatformSplit fb={{ spend: m.cur.fbSpend, res: m.cur.fbRes, cpr: fbCpr }} ig={{ spend: m.cur.igSpend, res: m.cur.igRes, cpr: igCpr }} />
          </Card>
        </div>
      </section>

      {/* ---------- LEADS ---------- */}
      <section className="gd-block" id="gd-s-leads">
        <SecHead n="04" icon="fa-user-plus" title="Leads" sub={`${num(m.leads)} leads in ${RW.words}${m.dup ? ` · ${num(m.dup)} duplicates` : ""}`} />
        <div className="gd-grid gd-grid-3">
          <Card title="Where leads come from" icon="fa-diagram-project" tone="green" sub="Share of leads by source — hover a slice" href="/lead-capture">
            <Donut center={compact(m.leads)} centerSub="leads"
              parts={m.src.map(([label, value], i) => ({ label, value, color: CAT[i % CAT.length] }))} />
          </Card>
          <Card title="When leads come in" icon="fa-clock" tone="violet" sub="Darker = more leads. Plan calling shifts around the dark cells">
            <Heatmap grid={m.heat} busy={m.busy} />
          </Card>
        </div>
      </section>

      {/* ---------- CAMPAIGNS ---------- */}
      <section className="gd-block" id="gd-s-camp">
        <SecHead n="05" icon="fa-ranking-star" title="Campaigns & services" sub="What is spending the most and what people ask for" />
        <div className="gd-grid gd-grid-2">
          <Card title="Top campaigns" icon="fa-ranking-star" tone="blue" sub="Biggest spend first · cost per result on the right" href="/campaigns">
            <TopList rows={m.camps.map((c) => ({
              name: c.name, value: c.spend, label: inr(c.spend),
              meta: `${num(c.results)} results`, right: c.results ? `${inr(c.spend / c.results, 2)} / result` : "no results",
              flag: cpr && c.results && c.spend / c.results > cpr * 1.3 ? "bad" : cpr && c.results && c.spend / c.results < cpr * 0.85 ? "good" : "",
            }))} empty="Campaign spend shows here after the first Meta sync." color={BLUE} />
          </Card>
          <Card title="What people ask for" icon="fa-briefcase" tone="green" sub="Leads by service" href="/lead-capture">
            <TopList rows={m.svc.map(([name, v]) => ({ name, value: v, label: num(v), meta: m.leads ? `${pct(v, m.leads).toFixed(0)}% of leads` : "" }))}
              empty="Services appear once leads have a service set." color={GREEN} />
          </Card>
        </div>
      </section>

      {/* ---------- MODULES ---------- */}
      <section className="gd-block" id="gd-s-mods">
        <SecHead n="06" icon="fa-grip" title="Every module at a glance" sub="Click a card to open it" />
        <div className="gd-mods">
          <Mod href="/ad-accounts" icon="fa-rectangle-ad" title="Ad Accounts" tone="blue" note={m.problems.length ? `${m.problems.length} need attention` : "All accounts healthy"} noteTone={m.problems.length ? "bad" : "good"}
            stats={[[num(m.accounts.length), "connected"], [compact(m.lifetime, true), "lifetime spend"]]} />
          <Mod href="/campaigns" icon="fa-bullhorn" title="Campaigns" tone="gold" note={`${num(m.adsPaused)} paused`}
            stats={[[num(m.adsActive), "running"], [compact(m.cur.spend, true), "spent"]]} />
          <Mod href="/create-ad" icon="fa-wand-magic-sparkles" title="Create Ad" tone="violet" note="Lead form or WhatsApp ad"
            stats={[["New ad", "with live preview"]]} />
          <Mod href="/ad-wallet" icon="fa-wallet" title="Ad Wallet" tone="rose" note={m.lastPay ? `Last paid ${short(String(m.lastPay.date).slice(0, 10))}` : "No payments yet"}
            stats={[[compact(m.paid, true), "paid"], [compact(m.unbilled, true), "unbilled now"]]} />
          <Mod href="/lead-capture" icon="fa-user-plus" title="Lead Capture" tone="green" note={`${num(m.totalLeads)} leads all time`}
            stats={[[num(m.todayLeads), "today"], [num(m.leads), "in range"]]} />
          <Mod href="/comparison" icon="fa-code-compare" title="Comparison" tone="aqua" note="Platform · month · funnel"
            stats={[[fbCpr && igCpr ? (fbCpr <= igCpr ? "Facebook" : "Instagram") : "—", "cheaper now"]]} />
          <Mod href="/reports" icon="fa-file-invoice" title="Reports" tone="violet" note="Summary, campaigns, daily, monthly, leads, billing"
            stats={[["7", "reports"], ["CSV", "& PDF"]]} />
          <Mod href="/settings" icon="fa-gear" title="Settings" tone="slate" note="Users, access and connections"
            stats={[["Team", "& permissions"]]} />        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Pieces
   ============================================================ */
function SecHead({ n: no, icon, title, sub }) {
  return (
    <div className="gd-sec">
      <div className="gd-sec-ic" aria-hidden="true"><i className={`fa-solid ${icon}`} /></div>
      <div className="gd-sec-tx">
        <div className="gd-sec-t">{no ? <em>{no}</em> : null}{title}</div>
        {sub ? <div className="gd-sec-s">{sub}</div> : null}
      </div>
    </div>
  );
}

function Card({ title, icon, tone = "gold", sub, href, stat, children }) {
  return (
    <div className={`gd-card t-${tone}`}>
      <div className="gd-card-h">
        <div className="gd-card-ic" aria-hidden="true"><i className={`fa-solid ${icon}`} /></div>
        <div className="gd-card-tt">
          <div className="gd-card-t">{title}</div>
          {sub ? <div className="gd-card-s">{sub}</div> : null}
        </div>
        {stat ? <div className="gd-card-stat">{stat}</div> : null}
        {href ? <a className="gd-card-link" href={href} aria-label={`Open ${title}`} title="Open"><i className="fa-solid fa-arrow-right gd-ne" /></a> : null}
      </div>
      <div className="gd-card-b">{children}</div>
    </div>
  );
}

/* Period picker — sticky bar me, ek click pe list khulti hai */
function Period({ range, R, RW, stamp, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="gd-per" ref={ref}>
      {stamp ? <span className="gd-per-up"><i className="fa-solid fa-rotate" /> Updated {stamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span> : null}
      <button type="button" className={`gd-per-btn${open ? " on" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <i className="fa-regular fa-calendar" />
        <span className="gd-per-l"><b>{RW.long}</b><small>{short(R.from)}{R.from !== R.to ? ` – ${short(R.to)}` : ""}</small></span>
        <i className="fa-solid fa-chevron-down gd-per-cv" />
      </button>
      {open ? (
        <div className="gd-per-menu" role="listbox" aria-label="Period">
          {RANGES.map((x) => {
            const r = rangeDates(x.key);
            return (
              <button key={x.key} type="button" role="option" aria-selected={range === x.key} className={range === x.key ? "on" : ""} onClick={() => { onPick(x.key); setOpen(false); }}>
                <span><b>{x.long}</b><small>{short(r.from)}{r.from !== r.to ? ` – ${short(r.to)}` : ""} · {r.days} day{r.days === 1 ? "" : "s"}</small></span>
                {range === x.key ? <i className="fa-solid fa-check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ icon, tone, label, help, value, fmt, prev, spark, sub, goodWhen = "up", action = null }) {
  const v = useCountUp(value);
  const delta = prev > 0 ? pct(value - prev, prev) : null;
  const up = delta !== null && delta >= 0;
  const flat = delta !== null && Math.abs(delta) < 0.5;
  const cls = delta === null || flat ? "flat" : goodWhen === "neutral" ? "neutral" : (goodWhen === "down" ? !up : up) ? "good" : "bad";
  const words = delta === null ? "No data to compare" : flat ? "Same as before" : `${Math.abs(delta) >= 999 ? "999+" : Math.abs(delta).toFixed(0)}% ${up ? "more" : "less"} than before`;
  return (
    <div className={`gd-kpi t-${tone}`} title={help}>
      <div className="gd-kpi-top">
        <span className="gd-kpi-ic"><i className={`fa-solid ${icon}`} /></span>
        <span className="gd-kpi-l">{label}<i className="fa-regular fa-circle-question gd-help" aria-label={help} /></span>
      </div>
      {action ? <div style={{ margin: "-4px 0 10px" }}>{action}</div> : null}
      <div className="gd-kpi-v">{fmt(v)}</div>
      <div className={`gd-delta ${cls}`}>
        <i className={`fa-solid ${delta === null || flat ? "fa-minus" : up ? "fa-arrow-up" : "fa-arrow-down"}`} /> {words}
      </div>
      <div className="gd-kpi-sub">{sub}</div>
      {spark && spark.some((x) => x > 0) ? <Spark data={spark} /> : null}
    </div>
  );
}

function Spark({ data }) {
  const w = 160; const h = 34; const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((y, i) => [i * step, h - 3 - (y / max) * (h - 8)]);
  const line = smoothPath(pts);
  return (
    <svg className="gd-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line}L${w},${h}L0,${h}Z`} className="gd-spark-a" />
      <path d={line} className="gd-spark-l" pathLength="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------- Area chart (smooth, glow, avg line, peak) ---------- */
function AreaChart({ data }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  const H = 260; const P = { l: 54, r: 16, t: 22, b: 30 };
  const W = Math.max(280, w);
  const vals = data.map((x) => x.spend);
  const max = niceAxis(Math.max(1, ...vals) * 1.08);
  const iw = W - P.l - P.r; const ih = H - P.t - P.b;
  const xs = (i) => P.l + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2);
  const ys = (v) => P.t + ih - (v / max) * ih;
  const pts = data.map((x, i) => [xs(i), ys(x.spend)]);
  const line = smoothPath(pts);
  const area = `${line}L${xs(data.length - 1).toFixed(1)},${P.t + ih}L${xs(0).toFixed(1)},${P.t + ih}Z`;
  const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const peakI = vals.indexOf(Math.max(...vals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 70))));
  const uid = useRef(`a${Math.random().toString(36).slice(2, 8)}`).current;

  function move(clientX, el) {
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - P.l) / iw) * (data.length - 1));
    setHi(Math.max(0, Math.min(data.length - 1, i)));
  }
  const h = hi !== null ? data[hi] : null;
  if (!vals.some((v) => v > 0)) return <div className="gd-chart" ref={ref}><div className="gd-none">No spend in this range.</div></div>;
  return (
    <div className="gd-chart" ref={ref}>
      <div className="gd-legend">
        <span><i style={{ background: GOLD }} />Spent per day</span>
        <span><i className="gd-lg-dash" />Average {inr(avg)}/day</span>
        {data.length > 1 ? <span><i className="gd-lg-dot" />Highest day {inr(vals[peakI])}</span> : null}
      </div>
      {w ? (
        <svg width={W} height={H} onMouseMove={(e) => move(e.clientX, e.currentTarget)} onMouseLeave={() => setHi(null)}
          onTouchMove={(e) => e.touches[0] && move(e.touches[0].clientX, e.currentTarget)} onTouchStart={(e) => e.touches[0] && move(e.touches[0].clientX, e.currentTarget)}
          role="img" aria-label="Daily ad spend">
          <defs>
            <linearGradient id={`${uid}-f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity="0.38" />
              <stop offset="70%" stopColor={GOLD} stopOpacity="0.06" />
              <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-s`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F6C453" />
              <stop offset="100%" stopColor="#C8860A" />
            </linearGradient>
            <filter id={`${uid}-g`} x="-10%" y="-30%" width="120%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.91  0 0 0 0 0.66  0 0 0 0 0.11  0 0 0 0.45 0" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} className="gd-grid-l" />
              <text x={P.l - 10} y={ys(t) + 4} className="gd-ax" textAnchor="end">{compact(t, true)}</text>
            </g>
          ))}
          {data.map((x, i) => ((i % every === 0 && data.length - 1 - i >= every * 0.6) || i === data.length - 1) ? (
            <text key={x.date} x={xs(i)} y={H - 8} className="gd-ax" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>{short(x.date)}</text>
          ) : null)}
          <path d={area} fill={`url(#${uid}-f)`} className="gd-area" />
          <line x1={P.l} x2={W - P.r} y1={ys(avg)} y2={ys(avg)} className="gd-avg" />
          <path d={line} className="gd-line" stroke={`url(#${uid}-s)`} filter={`url(#${uid}-g)`} pathLength="1" />
          {data.length > 1 && hi === null ? (
            <g className="gd-peak">
              <circle cx={xs(peakI)} cy={ys(vals[peakI])} r="4.5" />
              <text x={Math.min(Math.max(xs(peakI), P.l + 30), W - P.r - 30)} y={ys(vals[peakI]) - 10} textAnchor="middle">peak {compact(vals[peakI], true)}</text>
            </g>
          ) : null}
          {h ? (
            <g>
              <line x1={xs(hi)} x2={xs(hi)} y1={P.t} y2={P.t + ih} className="gd-cross" />
              <circle cx={xs(hi)} cy={ys(h.spend)} r="10" className="gd-halo" />
              <circle cx={xs(hi)} cy={ys(h.spend)} r="5.5" className="gd-dot" />
            </g>
          ) : null}
        </svg>
      ) : null}
      {h ? (
        <div className="gd-tip" style={{ left: Math.min(Math.max(xs(hi), 84), W - 84), top: Math.max(58, ys(h.spend) - 14) }}>
          <b>{short(h.date)}</b>
          <span><i style={{ background: GOLD }} />Spent <em>{inr(h.spend, 2)}</em></span>
          <span><i style={{ background: BLUE }} />Results <em>{num(h.results)}</em></span>
          <span><i style={{ background: GREEN }} />Leads in panel <em>{num(h.leads)}</em></span>
          {h.results ? <span className="gd-tip-f">{inr(h.spend / h.results, 2)} per result</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Paired bars (same unit → one axis) ---------- */
function PlatformSplit({ fb, ig }) {
  const total = fb.spend + ig.spend;
  const fbP = total ? (fb.spend / total) * 100 : 0;
  const diff = fb.cpr && ig.cpr ? Math.abs(pct(fb.cpr - ig.cpr, Math.max(fb.cpr, ig.cpr))) : 0;
  const winner = fb.cpr && ig.cpr ? (diff < 3 ? "tie" : fb.cpr <= ig.cpr ? "fb" : "ig") : "";
  if (!total) return <div className="gd-none">No spend in this range.</div>;
  return (
    <div className="gd-ps">
      <Donut money center={compact(total, true)} centerSub="total spent" compactLegend
        parts={[{ label: "Facebook", value: fb.spend, color: FB, icon: "fa-brands fa-facebook-f" }, { label: "Instagram", value: ig.spend, color: IG, icon: "fa-brands fa-instagram" }]} />
      <div className="gd-ps-rows">
        {[["fb", "Facebook", FB, fb, "fa-brands fa-facebook-f"], ["ig", "Instagram", IG, ig, "fa-brands fa-instagram"]].map(([k, label, c, x, icon]) => (
          <div key={k} className={`gd-ps-row${winner === k ? " win" : ""}`}>
            <span className="gd-ps-ic" style={{ background: c }}><i className={icon} /></span>
            <div className="gd-ps-m"><b>{label}</b><small>{num(x.res)} results · {k === "fb" ? fbP.toFixed(0) : (100 - fbP).toFixed(0)}% of spend</small></div>
            <div className="gd-ps-v"><b>{x.cpr ? inr(x.cpr, 2) : "—"}</b><small>per result</small></div>
          </div>
        ))}
      </div>
      {winner ? (
        <div className="gd-verdict">
          <i className="fa-solid fa-trophy" />
          {winner === "tie" ? <>Both cost about the same per result (less than 3% apart).</> : <><b>{winner === "fb" ? "Facebook" : "Instagram"}</b> gives results <b>{diff.toFixed(0)}% cheaper</b> right now.</>}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Donut ---------- */
function Donut({ parts, center, centerSub, money = false, compactLegend = false }) {
  const [hi, setHi] = useState(null);
  const total = parts.reduce((a, p) => a + p.value, 0);
  const R = 78; const r = 54; const C = 90;
  let a0 = -Math.PI / 2;
  const live = parts.filter((p) => p.value > 0).length;
  const gap = live > 1 ? 0.03 : 0;
  const arcs = parts.map((p, i) => {
    const frac = total ? p.value / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const s = a0 + (frac ? gap / 2 : 0); const e = a1 - (frac ? gap / 2 : 0);
    a0 = a1;
    return { ...p, i, frac, d: frac >= 0.999 ? ring(C, R, r) : arcPath(C, R, r, s, Math.max(s, e)) };
  });
  const h = hi !== null ? arcs[hi] : null;
  return (
    <div className={`gd-donut-w${compactLegend ? " solo" : ""}`}>
      <div className="gd-donut-box">
        <svg viewBox="0 0 180 180" className="gd-donut" role="img" aria-label={`${centerSub} split`}>
          <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="#F1F3F8" strokeWidth={R - r} />
          {total ? arcs.map((a) => a.frac > 0 ? (
            <path key={a.label} d={a.d} fill={a.color} className={`gd-arc${hi !== null && hi !== a.i ? " dim" : ""}${hi === a.i ? " on" : ""}`}
              style={{ animationDelay: `${a.i * 110}ms`, transformOrigin: "90px 90px" }}
              onMouseEnter={() => setHi(a.i)} onMouseLeave={() => setHi(null)} onTouchStart={() => setHi(a.i)} />
          ) : null) : null}
          <text x={C} y={C + 1} textAnchor="middle" className="gd-donut-c">{h ? (money ? compact(h.value, true) : num(h.value)) : center}</text>
          <text x={C} y={C + 18} textAnchor="middle" className="gd-donut-cs">{h ? `${(h.frac * 100).toFixed(0)}% · ${h.label}` : centerSub}</text>
        </svg>
      </div>
      {!compactLegend ? (
        <div className="gd-dl">
          {parts.length ? parts.map((p, i) => (
            <div key={p.label} className={`gd-dl-row${hi === i ? " on" : ""}`} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
              <span className="gd-dl-sw" style={{ background: p.color }} />
              <b className="gd-dl-n">{p.label}</b>
              <span className="gd-dl-bar"><i style={{ width: `${total ? (p.value / total) * 100 : 0}%`, background: p.color }} /></span>
              <b className="gd-dl-num">{money ? inr(p.value) : num(p.value)}</b>
              <small>{total ? `${((p.value / total) * 100).toFixed(0)}%` : "0%"}</small>
            </div>
          )) : <div className="gd-none">No leads in this range.</div>}
        </div>
      ) : null}
    </div>
  );
}
function arcPath(c, R, r, s, e) {
  const large = e - s > Math.PI ? 1 : 0;
  const p = (rad, a) => `${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`;
  return `M${p(R, s)}A${R},${R} 0 ${large} 1 ${p(R, e)}L${p(r, e)}A${r},${r} 0 ${large} 0 ${p(r, s)}Z`;
}
function ring(c, R, r) {
  return `M${c - R},${c}a${R},${R} 0 1,0 ${R * 2},0a${R},${R} 0 1,0 ${-R * 2},0ZM${c - r},${c}a${r},${r} 0 1,1 ${r * 2},0a${r},${r} 0 1,1 ${-r * 2},0Z`;
}

/* ---------- Heatmap (one hue, light → dark) ---------- */
const HEAT = ["#F1F3F8", "#d6e6f8", "#a9c9f0", "#6fa3e3", "#3d7fd3", "#1f5fae"];
function Heatmap({ grid, busy }) {
  const [hi, setHi] = useState(null);
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const shade = (v) => (v ? HEAT[Math.min(5, 1 + Math.floor((v / max) * 5 - 1e-9))] : HEAT[0]);
  return (
    <div className="gd-heat">
      <div className="gd-heat-grid" onMouseLeave={() => setHi(null)}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="gd-heat-hx">{h % 3 === 0 ? hr(h) : ""}</span>)}
        {grid.map((row, d) => (
          <HeatRow key={d} label={WD[d]}>
            {row.map((v, h) => (
              <span key={h} className={`gd-cell${hi && hi.d === d && hi.h === h ? " on" : ""}`} style={{ background: shade(v), animationDelay: `${(d * 24 + h) * 3}ms` }}
                onMouseEnter={() => setHi({ d, h, v })} onTouchStart={() => setHi({ d, h, v })} />
            ))}
          </HeatRow>
        ))}
      </div>
      <div className="gd-heat-f">
        {hi ? <span><b>{WDL[hi.d]}, {hr(hi.h)}–{hr((hi.h + 1) % 24)}</b> · {num(hi.v)} lead{hi.v === 1 ? "" : "s"}</span>
          : total && busy ? <span><i className="fa-solid fa-fire" /> Busiest: <b>{WDL[busy.d]} {hr(busy.h)}</b> ({num(busy.v)} leads)</span> : <span>No timed leads in this range.</span>}
        <span className="gd-heat-scale">fewer {HEAT.map((c) => <i key={c} style={{ background: c }} />)} more</span>
      </div>
    </div>
  );
}
function HeatRow({ label, children }) {
  return <><span className="gd-heat-dy">{label}</span>{children}</>;
}

/* ---------- Ranked list ---------- */
function TopList({ rows, empty, color }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="gd-none">{empty}</div>;
  return (
    <div className="gd-top">
      {rows.map((r, i) => (
        <div className="gd-top-row" key={r.name} style={{ animationDelay: `${i * 60}ms` }}>
          <span className="gd-top-rank">{i + 1}</span>
          <div className="gd-top-m">
            <div className="gd-top-h"><b title={r.name}>{r.name}</b><em>{r.label}</em></div>
            <div className="gd-top-track"><div className="gd-top-bar" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, animationDelay: `${i * 80}ms` }} /></div>
            <div className="gd-top-f">
              <small>{r.meta}</small>
              {r.right ? <small className={`gd-top-r ${r.flag || ""}`}>{r.flag === "good" ? <i className="fa-solid fa-circle-check" /> : r.flag === "bad" ? <i className="fa-solid fa-circle-exclamation" /> : null} {r.right}</small> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Module card ---------- */
function Mod({ href, icon, title, tone, stats, note, noteTone = "" }) {
  return (
    <a href={href} className={`gd-mod t-${tone}`}>
      <div className="gd-mod-h">
        <span className="gd-mod-ic"><i className={`fa-solid ${icon}`} /></span>
        <b>{title}</b>
        <i className="fa-solid fa-arrow-right gd-mod-go" />
      </div>
      <div className="gd-mod-s">
        {stats.map(([v, l], i) => (<div key={i}><em>{v}</em><span>{l}</span></div>))}
      </div>
      {note ? <div className={`gd-mod-note ${noteTone}`}>{noteTone === "bad" ? <i className="fa-solid fa-circle-exclamation" /> : noteTone === "good" ? <i className="fa-solid fa-circle-check" /> : null} {note}</div> : null}
    </a>
  );
}