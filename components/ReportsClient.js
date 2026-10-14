"use client";

/* ============================================================
   components/ReportsClient.js — Reports (pehle "Analytics")

   Saari reports ek page pe, tabs me — jo tab chuno sirf uska data dikhe:
     1. Summary       — poore period ka report card + pichhle period se tulna
     2. Campaigns     — har campaign: spend, clicks, CTR, results, CPR, leads
     3. Day by day    — har din ka hisaab
     4. Month by month— pichhle 12 mahine
     5. Facebook vs Instagram
     6. Leads         — source, service, stage, staff, duplicates
     7. Billing       — Meta ko kitna diya (Funded / Paid / Failed)
   Har report ke upar apna "CSV" button, aur Print / PDF us tab ka.
   Data wahi jo panel already sync karta hai — koi naya API call nahi.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { DATASETS } from "../lib/marketing-config";
import { readRows } from "../lib/marketing-local";

/* ---------- helpers ---------- */
const n = (v) => { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; };
const inr = (v, d = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: d, minimumFractionDigits: d }).format(n(v));
const num = (v) => new Intl.NumberFormat("en-IN").format(Math.round(n(v)));
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const z = (k) => String(k).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WDL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const short = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return m ? `${d} ${MON[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}` : ""; };
const monthName = (ym) => { const [y, m] = String(ym).split("-").map(Number); return `${MON[m - 1]} ${y}`; };
function compact(v, money = false) {
  const x = Math.abs(n(v)); const s = n(v) < 0 ? "-" : ""; const p = money ? "₹" : "";
  if (x >= 1e7) return `${s}${p}${(x / 1e7).toFixed(1)}Cr`;
  if (x >= 1e5) return `${s}${p}${(x / 1e5).toFixed(1)}L`;
  if (x >= 1e3) return `${s}${p}${(x / 1e3).toFixed(1)}K`;
  return `${s}${p}${Math.round(x)}`;
}
const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const FB = "#1877F2"; const IG = "#D62976";

const PERIODS = [
  { key: "7", label: "Last 7 days", words: "the last 7 days" },
  { key: "30", label: "Last 30 days", words: "the last 30 days" },
  { key: "month", label: "This month", words: "this month" },
  { key: "lastmonth", label: "Last month", words: "last month" },
  { key: "90", label: "Last 90 days", words: "the last 90 days" },
  { key: "year", label: "This year", words: "this year" },
  { key: "custom", label: "Custom", words: "the chosen dates" },
];
function periodDates(key, cf, ct) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let from = new Date(now); let to = new Date(now);
  if (key === "7") from.setDate(from.getDate() - 6);
  else if (key === "30") from.setDate(from.getDate() - 29);
  else if (key === "90") from.setDate(from.getDate() - 89);
  else if (key === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (key === "lastmonth") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if (key === "year") from = new Date(now.getFullYear(), 0, 1);
  else if (key === "custom" && cf && ct) { from = new Date(`${cf}T00:00:00`); to = new Date(`${ct}T00:00:00`); if (from > to) [from, to] = [to, from]; }
  const days = Math.round((to - from) / 864e5) + 1;
  const pTo = new Date(from); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - (days - 1));
  const list = []; for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) list.push(day(d));
  return { from: day(from), to: day(to), pFrom: day(pFrom), pTo: day(pTo), days, list };
}

const REPORTS = [
  { key: "summary", label: "Summary", icon: "fa-file-lines", desc: "Report card for the period" },
  { key: "campaigns", label: "Campaigns", icon: "fa-bullhorn", desc: "Every campaign, side by side" },
  { key: "daily", label: "Day by day", icon: "fa-calendar-day", desc: "Spend, results and leads per day" },
  { key: "monthly", label: "Month by month", icon: "fa-calendar", desc: "The last 12 months" },
  { key: "platform", label: "Facebook vs Instagram", icon: "fa-scale-balanced", desc: "Which platform works better" },
  { key: "leads", label: "Leads", icon: "fa-user-plus", desc: "Sources, services, stages, staff" },
  { key: "billing", label: "Billing", icon: "fa-wallet", desc: "Money added and paid to Meta" },
];

/* ============================================================ */
export default function ReportsClient() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("summary");
  const [period, setPeriod] = useState("30");
  const [cf, setCf] = useState(""); const [ct, setCt] = useState("");
  const [stamp, setStamp] = useState(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("vk_rep_tab"); if (t && REPORTS.some((x) => x.key === t)) setTab(t);
      const p = localStorage.getItem("vk_rep_period"); if (p && PERIODS.some((x) => x.key === p) && p !== "custom") setPeriod(p);
    } catch { /* */ }
    const load = () => {
      const next = {}; Object.entries(DATASETS).forEach(([alias, key]) => { next[alias] = readRows(key); });
      setD(next); setStamp(new Date());
    };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);
  const pickTab = (k) => { setTab(k); try { localStorage.setItem("vk_rep_tab", k); } catch { /* */ } };
  const pickPeriod = (k) => {
    setPeriod(k);
    if (k === "custom" && !cf) { const R0 = periodDates("30"); setCf(R0.from); setCt(R0.to); }
    try { localStorage.setItem("vk_rep_period", k); } catch { /* */ }
  };

  const R = useMemo(() => periodDates(period, cf, ct), [period, cf, ct]);
  const P = PERIODS.find((x) => x.key === period);

  const x = useMemo(() => (d ? build(d, R) : null), [d, R]);
  if (!x) return <div className="rp"><div className="gd-skel" /></div>;
  function download(rep) {
    const t = tableFor(rep, x);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [t.head, ...t.rows].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }));
    a.download = `vakilkaro-${rep}-report-${R.from}-to-${R.to}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const BODY = {
    summary: <Summary x={x} P={P} R={R} />,
    campaigns: <Campaigns x={x} />,
    daily: <Daily x={x} />,
    monthly: <Monthly x={x} />,
    platform: <Platform x={x} />,
    leads: <Leads x={x} />,
    billing: <Billing x={x} />,
  };

  return (
    <div className="rp">
      {/* ---------- head ---------- */}
      <section className="rp-hero">
        <div className="rp-hero-l">
          <span className="rp-kick"><i className="fa-solid fa-file-invoice" /> Reports</span>
          <h1>Reports</h1>
          <p>Summary, campaigns, daily, monthly, platforms, leads and billing · <b>{short(R.from)}{R.from !== R.to ? ` – ${short(R.to)}` : ""}</b> ({R.days} day{R.days === 1 ? "" : "s"})</p>
        </div>
        <div className="rp-hero-r">
          <PeriodPick period={period} R={R} onPick={pickPeriod} cf={cf} ct={ct} setCf={setCf} setCt={setCt} />
          <div className="rp-acts">
            <button type="button" className="rp-btn dark" onClick={() => window.print()}><i className="fa-solid fa-print" /> Print / PDF</button>
          </div>
        </div>
      </section>

      {/* ---------- tabs — jo chuno sirf wahi report ---------- */}
      <nav className="rp-jump rp-tabs" aria-label="Reports">
        <div className="rp-tabs-in" role="tablist">
        {REPORTS.map((r, i) => (
          <button key={r.key} type="button" role="tab" aria-selected={tab === r.key} className={tab === r.key ? "on" : ""} onClick={() => pickTab(r.key)}>
            <em>{String(i + 1).padStart(2, "0")}</em><i className={`fa-solid ${r.icon}`} /><span>{r.label}</span>
          </button>
        ))}
        </div>
        <span className="rp-jump-up"><i className="fa-solid fa-rotate" /> {stamp ? stamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
      </nav>

      <div className="rp-print-h">
        <b>VakilKaro — {REPORTS.find((r) => r.key === tab)?.label} report</b>
        <span>{short(R.from)} – {short(R.to)} · generated {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>

      {/* ---------- chuna hua tab ---------- */}
      <div className="rp-all" key={`${tab}-${R.from}-${R.to}`}>
        {REPORTS.map((r, i) => (r.key !== tab ? null : (
          <section key={r.key} id={`rp-${r.key}`} className="rp-part">
            <header className="rp-part-h">
              <div className="rp-part-ic"><i className={`fa-solid ${r.icon}`} /></div>
              <div className="rp-part-tx">
                <div className="rp-part-t"><em>{String(i + 1).padStart(2, "0")}</em>{r.label}</div>
                <small>{r.desc}{r.key === "monthly" ? " · always the last 12 months" : ` · ${short(R.from)}${R.from !== R.to ? ` – ${short(R.to)}` : ""}`}</small>
              </div>
              <button type="button" className="rp-csv" onClick={() => download(r.key)} title={`Download ${r.label} as CSV`}><i className="fa-solid fa-file-csv" /> CSV</button>
            </header>
            <div className="rp-main">{BODY[r.key]}</div>
          </section>
        )))}
      </div>
    </div>
  );
}

/* ============================================================
   Data
   ============================================================ */
function build(d, R) {
  const inR = (s) => s >= R.from && s <= R.to;
  const inP = (s) => s >= R.pFrom && s <= R.pTo;
  const blank = () => ({ spend: 0, impr: 0, clicks: 0, results: 0, form: 0, chats: 0, leads: 0, conv: 0, fbSpend: 0, igSpend: 0, fbRes: 0, igRes: 0, fbImpr: 0, igImpr: 0, fbClicks: 0, igClicks: 0, fbLeads: 0, igLeads: 0 });
  const cur = blank(); const prev = blank();
  const byDay = {}; R.list.forEach((s) => { byDay[s] = blank(); });
  const camp = {}; const byMonth = {};
  const now = new Date(); const months = [];
  for (let i = 11; i >= 0; i -= 1) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); const k = `${m.getFullYear()}-${z(m.getMonth() + 1)}`; months.push(k); byMonth[k] = { ...blank(), funded: 0 }; }

  (d.dailyStats || []).forEach((r) => {
    const s = String(r.date || "").slice(0, 10); if (!s) return;
    const sp = n(r.spend); const res = n(r.results ?? r.leads); const im = n(r.impressions); const cl = n(r.linkClicks || r.clicks);
    const ig = r.channel === "Instagram";
    const add = (t) => {
      t.spend += sp; t.results += res; t.form += n(r.formLeads); t.chats += n(r.chats); t.impr += im; t.clicks += cl;
      if (ig) { t.igSpend += sp; t.igRes += res; t.igImpr += im; t.igClicks += cl; } else { t.fbSpend += sp; t.fbRes += res; t.fbImpr += im; t.fbClicks += cl; }
    };
    const mk = s.slice(0, 7); if (byMonth[mk]) add(byMonth[mk]);
    if (inP(s)) add(prev);
    if (!inR(s)) return;
    add(cur); if (byDay[s]) add(byDay[s]);
    const k = r.campaign || "Unnamed";
    camp[k] = camp[k] || { name: k, ...blank(), days: new Set() };
    add(camp[k]); camp[k].days.add(s);
  });

  const lDay = (r) => String(r.receivedAt || r.createdAt || "").slice(0, 10);
  const isConv = (r) => String(r.stage || "").toLowerCase() === "converted";
  const leadsCur = []; let leadsPrev = 0; let convPrev = 0;
  (d.inbox || []).forEach((r) => {
    const s = lDay(r);
    const mk = s.slice(0, 7); if (byMonth[mk]) { byMonth[mk].leads += 1; if (isConv(r)) byMonth[mk].conv += 1; }
    if (inP(s)) { leadsPrev += 1; if (isConv(r)) convPrev += 1; }
    if (!inR(s)) return;
    leadsCur.push(r); cur.leads += 1; if (isConv(r)) cur.conv += 1;
    if (byDay[s]) { byDay[s].leads += 1; if (isConv(r)) byDay[s].conv += 1; }
    if (r.source === "Instagram") cur.igLeads += 1; else if (r.source === "Facebook" || r.source === "Meta") cur.fbLeads += 1;
    if (r.campaign && camp[r.campaign]) { camp[r.campaign].leads += 1; if (isConv(r)) camp[r.campaign].conv += 1; }
  });
  prev.leads = leadsPrev; prev.conv = convPrev;

  /* leads breakdowns */
  const group = (key, fallback) => {
    const m = {};
    leadsCur.forEach((r) => {
      const k = String(r[key] || "").trim() || fallback;
      m[k] = m[k] || { name: k, leads: 0, conv: 0, dup: 0, junk: 0, contacted: 0 };
      m[k].leads += 1;
      if (isConv(r)) m[k].conv += 1;
      if (r.flag === "Duplicate") m[k].dup += 1;
      if (r.flag === "Junk") m[k].junk += 1;
      if (["contacted", "qualified", "converted"].includes(String(r.stage || "").toLowerCase())) m[k].contacted += 1;
    });
    return Object.values(m).sort((a, b) => b.leads - a.leads);
  };
  const STAGES = ["New", "Contacted", "Qualified", "Converted", "Lost"];
  const stages = STAGES.map((s) => ({ name: s, leads: leadsCur.filter((r) => (String(r.stage || "New")) === s).length }));
  const wd = Array(7).fill(0);
  leadsCur.forEach((r) => { const t = r.receivedTime ? new Date(r.receivedTime) : new Date(`${lDay(r)}T12:00:00`); if (!Number.isNaN(t.getTime())) wd[(t.getDay() + 6) % 7] += 1; });

  /* billing */
  const led = (d.walletLedger || []).filter((r) => r.date);
  const st = (r) => r.metaStatus || (r.status === "Cancelled" ? "Failed" : r.type === "Credit" ? "Funded" : r.type === "Refund" ? "Refunded" : "Paid");
  const ok = (r) => (r.status || "Posted") === "Posted";
  led.forEach((r) => { const mk = String(r.date).slice(0, 7); if (byMonth[mk] && r.type === "Credit" && ok(r)) byMonth[mk].funded += n(r.amount); });
  const ledCur = led.filter((r) => inR(String(r.date).slice(0, 10))).sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`));
  const bill = {
    rows: ledCur,
    funded: ledCur.filter((r) => r.type === "Credit" && ok(r)).reduce((a, r) => a + n(r.amount), 0),
    fundedN: ledCur.filter((r) => r.type === "Credit" && ok(r)).length,
    paidAds: ledCur.filter((r) => r.type === "Spend" && ok(r)).reduce((a, r) => a + n(r.amount), 0),
    failed: ledCur.filter((r) => st(r) === "Failed").length,
    failedAmt: ledCur.filter((r) => st(r) === "Failed").reduce((a, r) => a + n(r.amount), 0),
    refunds: ledCur.filter((r) => r.type === "Refund" && ok(r)).reduce((a, r) => a + n(r.amount), 0),
    status: st,
  };

  const camps = Object.values(camp).map((c) => ({ ...c, days: c.days.size })).sort((a, b) => b.spend - a.spend);
  return {
    cur, prev, camps, R,
    series: R.list.map((s) => ({ date: s, ...byDay[s] })),
    months: months.map((k) => ({ month: k, ...byMonth[k] })),
    sources: group("source", "Other"), services: group("service", "Not set"), staff: group("assignedTo", "Not assigned"),
    stages, weekday: wd, leadsCur,
    dup: leadsCur.filter((r) => r.flag === "Duplicate").length, junk: leadsCur.filter((r) => r.flag === "Junk").length,
    bill,
    accounts: (d.accounts || []).filter((a) => a.platform === "Meta"),
  };
}

const cpr = (t) => (t.results ? t.spend / t.results : 0);
const cpl = (t) => (t.leads ? t.spend / t.leads : 0);
const ctr = (t) => pct(t.clicks, t.impr);

/* CSV for every report */
function tableFor(rep, x) {
  if (rep === "campaigns") return { head: ["Campaign", "Spend", "Share of spend %", "Impressions", "Link clicks", "CTR %", "Results", "Form leads", "Chats", "Cost per result", "Leads in panel", "Clients won"], rows: x.camps.map((c) => [c.name, c.spend.toFixed(2), pct(c.spend, x.cur.spend).toFixed(1), c.impr, c.clicks, ctr(c).toFixed(2), c.results, c.form, c.chats, cpr(c).toFixed(2), c.leads, c.conv]) };
  if (rep === "daily") return { head: ["Date", "Spend", "Facebook spend", "Instagram spend", "Impressions", "Link clicks", "Results", "Cost per result", "Leads in panel", "Clients won"], rows: [...x.series].reverse().map((s) => [s.date, s.spend.toFixed(2), s.fbSpend.toFixed(2), s.igSpend.toFixed(2), s.impr, s.clicks, s.results, cpr(s).toFixed(2), s.leads, s.conv]) };
  if (rep === "monthly") return { head: ["Month", "Spend", "Results", "Cost per result", "Leads in panel", "Cost per lead", "Clients won", "Money added to Meta"], rows: [...x.months].reverse().map((m) => [monthName(m.month), m.spend.toFixed(2), m.results, cpr(m).toFixed(2), m.leads, cpl(m).toFixed(2), m.conv, m.funded.toFixed(2)]) };
  if (rep === "platform") { const c = x.cur; return { head: ["Metric", "Facebook", "Instagram"], rows: [["Spend", c.fbSpend.toFixed(2), c.igSpend.toFixed(2)], ["Impressions", c.fbImpr, c.igImpr], ["Link clicks", c.fbClicks, c.igClicks], ["CTR %", pct(c.fbClicks, c.fbImpr).toFixed(2), pct(c.igClicks, c.igImpr).toFixed(2)], ["Results", c.fbRes, c.igRes], ["Cost per result", (c.fbRes ? c.fbSpend / c.fbRes : 0).toFixed(2), (c.igRes ? c.igSpend / c.igRes : 0).toFixed(2)], ["Leads in panel", c.fbLeads, c.igLeads]] }; }
  if (rep === "leads") return { head: ["Date", "Name", "Phone", "Source", "Campaign", "Service", "Stage", "Assigned to", "Flag"], rows: [...x.leadsCur].sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || ""))).map((r) => [r.receivedAt, r.name, r.phone, r.source, r.campaign, r.service, r.stage, r.assignedTo, r.flag]) };
  if (rep === "billing") return { head: ["Date", "Account", "Amount", "Payment method", "Payment status"], rows: x.bill.rows.map((r) => [r.date, r.account, n(r.amount).toFixed(2), r.method || r.payMode, x.bill.status(r)]) };
  const c = x.cur; const p = x.prev;
  return { head: ["Metric", "This period", "Previous period"], rows: [["Amount spent", c.spend.toFixed(2), p.spend.toFixed(2)], ["Impressions", c.impr, p.impr], ["Link clicks", c.clicks, p.clicks], ["CTR %", ctr(c).toFixed(2), ctr(p).toFixed(2)], ["Results", c.results, p.results], ["Cost per result", cpr(c).toFixed(2), cpr(p).toFixed(2)], ["Leads in panel", c.leads, p.leads], ["Cost per lead", cpl(c).toFixed(2), cpl(p).toFixed(2)], ["Clients won", c.conv, p.conv], ["Lead → client %", pct(c.conv, c.leads).toFixed(1), pct(p.conv, p.leads).toFixed(1)]] };
}

/* ============================================================
   Reports
   ============================================================ */
function Summary({ x, P, R }) {
  const c = x.cur; const p = x.prev;
  const rows = [
    { k: "Amount spent", ic: "fa-indian-rupee-sign", t: "gold", a: c.spend, b: p.spend, f: (v) => inr(v), good: "neutral" },
    { k: "Results", ic: "fa-bullseye", t: "blue", a: c.results, b: p.results, f: num, good: "up", sub: `${num(c.form)} form · ${num(c.chats)} chats` },
    { k: "Cost per result", ic: "fa-tag", t: "violet", a: cpr(c), b: cpr(p), f: (v) => (v ? inr(v, 2) : "—"), good: "down" },
    { k: "Leads in panel", ic: "fa-user-plus", t: "green", a: c.leads, b: p.leads, f: num, good: "up", sub: `${num(x.dup)} duplicates` },
    { k: "Cost per lead", ic: "fa-receipt", t: "rose", a: cpl(c), b: cpl(p), f: (v) => (v ? inr(v, 2) : "—"), good: "down" },
    { k: "Clients won", ic: "fa-handshake", t: "aqua", a: c.conv, b: p.conv, f: num, good: "up", sub: `${pct(c.conv, c.leads).toFixed(1)}% of leads` },
    { k: "Impressions", ic: "fa-eye", t: "slate", a: c.impr, b: p.impr, f: (v) => compact(v), good: "up" },
    { k: "Link clicks", ic: "fa-arrow-pointer", t: "blue", a: c.clicks, b: p.clicks, f: (v) => compact(v), good: "up", sub: `CTR ${ctr(c).toFixed(2)}%` },
  ];
  const best = x.camps.filter((k) => k.results >= 5).sort((a, b) => cpr(a) - cpr(b))[0];
  const worst = x.camps.filter((k) => k.results >= 5).sort((a, b) => cpr(b) - cpr(a))[0];
  const topSrc = x.sources[0]; const topSvc = x.services[0];
  const busyDay = x.weekday.indexOf(Math.max(...x.weekday));
  return (
    <>
      <div className="rp-card rp-verdict">
        <div className="rp-verdict-ic"><i className="fa-solid fa-feather-pointed" /></div>
        <div>
          <b>In {P.words}</b>
          <p>
            You spent <em>{inr(c.spend)}</em> on Meta ads and got <em>{num(c.results)}</em> results at <em>{cpr(c) ? inr(cpr(c), 2) : "—"}</em> each.{" "}
            <em>{num(c.leads)}</em> leads reached the panel ({cpl(c) ? `${inr(cpl(c), 2)} per lead` : "no spend"}) and <em>{num(c.conv)}</em> became clients.
            {p.spend ? <> Compared with the {R.days} days before, spend is {diffWord(c.spend, p.spend)} and cost per result is {diffWord(cpr(c), cpr(p))}.</> : null}
          </p>
        </div>
      </div>

      <div className="rp-kpis">
        {rows.map((r) => <Stat key={r.k} {...r} />)}
      </div>

      <Section title="Highlights" icon="fa-star" sub="Read from your data">
          <ul className="rp-hl wide">
            {best ? <li className="good"><i className="fa-solid fa-trophy" /><span><b>Cheapest campaign</b>{best.name} — {inr(cpr(best), 2)} per result</span></li> : null}
            {worst && worst !== best ? <li className="bad"><i className="fa-solid fa-triangle-exclamation" /><span><b>Costliest campaign</b>{worst.name} — {inr(cpr(worst), 2)} per result</span></li> : null}
            {topSrc ? <li><i className="fa-solid fa-diagram-project" /><span><b>Top lead source</b>{topSrc.name} — {num(topSrc.leads)} leads ({pct(topSrc.leads, c.leads).toFixed(0)}%)</span></li> : null}
            {topSvc ? <li><i className="fa-solid fa-briefcase" /><span><b>Most asked service</b>{topSvc.name} — {num(topSvc.leads)} leads</span></li> : null}
            {x.weekday.some(Boolean) ? <li><i className="fa-solid fa-calendar-week" /><span><b>Busiest day</b>{WDL[busyDay]} — {num(x.weekday[busyDay])} leads</span></li> : null}
            {x.bill.funded ? <li><i className="fa-solid fa-wallet" /><span><b>Money added to Meta</b>{inr(x.bill.funded)} in {x.bill.fundedN} payment{x.bill.fundedN === 1 ? "" : "s"}{x.bill.failed ? ` · ${x.bill.failed} failed` : ""}</span></li> : null}
          </ul>
      </Section>

    </>
  );
}

function Campaigns({ x }) {
  const [sort, setSort] = useState("spend");
  const rows = useMemo(() => {
    const k = { spend: (c) => c.spend, results: (c) => c.results, cpr: (c) => -(cpr(c) || 1e12), leads: (c) => c.leads, ctr: (c) => ctr(c) };
    return [...x.camps].sort((a, b) => k[sort](b) - k[sort](a));
  }, [x.camps, sort]);
  const c = x.cur;
  return (
    <>
      <div className="rp-kpis four">
        <Stat k="Campaigns with spend" ic="fa-bullhorn" t="gold" a={x.camps.length} f={num} />
        <Stat k="Total spend" ic="fa-indian-rupee-sign" t="blue" a={c.spend} f={(v) => inr(v)} />
        <Stat k="Average cost per result" ic="fa-tag" t="violet" a={cpr(c)} f={(v) => (v ? inr(v, 2) : "—")} />
        <Stat k="Average CTR" ic="fa-arrow-pointer" t="green" a={ctr(c)} f={(v) => `${v.toFixed(2)}%`} />
      </div>
      <Section title="All campaigns" icon="fa-table" sub="Green = cheaper than average · red = 30%+ costlier" right={
        <div className="rp-seg">{[["spend", "Spend"], ["results", "Results"], ["cpr", "Cheapest"], ["leads", "Leads"], ["ctr", "CTR"]].map(([k, l]) => <button key={k} type="button" className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}</div>
      }>
        <CampTable key={sort} rows={rows} total={c.spend} avg={cpr(c)} />
      </Section>
    </>
  );
}

function CampTable({ rows, total, avg, compact: small }) {
  const { rows: pr, offset, pager } = usePager(rows);
  if (!rows.length) return <Empty text="No campaign spend in this period." />;
  return (
    <>
    <div className="rp-tw">
      <table className="rp-t">
        <thead><tr><th>#</th><th>Campaign</th><th className="r">Spend</th>{small ? null : <><th className="r">Impr.</th><th className="r">Clicks</th><th className="r">CTR</th></>}<th className="r">Results</th>{small ? null : <th className="r">Form / Chats</th>}<th className="r">Cost / result</th><th className="r">Leads</th><th className="r">Clients</th></tr></thead>
        <tbody>
          {pr.map((c, j) => {
            const i = offset + j;
            const k = cpr(c); const fl = avg && k ? (k > avg * 1.3 ? "bad" : k < avg * 0.85 ? "good" : "") : "";
            return (
              <tr key={c.name}>
                <td><span className={`rp-rank${i === 0 ? " one" : ""}`}>{i + 1}</span></td>
                <td className="rp-name"><b title={c.name}>{c.name}</b><span className="rp-share"><i style={{ width: `${pct(c.spend, total)}%` }} /></span><small>{pct(c.spend, total).toFixed(1)}% of spend · {c.days} day{c.days === 1 ? "" : "s"}</small></td>
                <td className="r b">{inr(c.spend)}</td>
                {small ? null : <><td className="r">{compact(c.impr)}</td><td className="r">{compact(c.clicks)}</td><td className="r">{ctr(c).toFixed(2)}%</td></>}
                <td className="r">{num(c.results)}</td>
                {small ? null : <td className="r mut">{num(c.form)} / {num(c.chats)}</td>}
                <td className="r"><span className={`rp-pill ${fl}`}>{k ? inr(k, 2) : "—"}</span></td>
                <td className="r">{num(c.leads)}</td>
                <td className="r">{num(c.conv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pager}
    </>
  );
}

function Daily({ x }) {
  const rows = useMemo(() => [...x.series].reverse(), [x.series]);
  const { rows: pr, pager } = usePager(rows);
  const max = Math.max(1, ...rows.map((s) => s.spend));
  const c = x.cur;
  const active = x.series.filter((s) => s.spend > 0);
  const best = active.length ? active.reduce((a, s) => (s.results && (!a.results || cpr(s) < cpr(a)) ? s : a), active[0]) : null;
  return (
    <>
      <div className="rp-kpis four">
        <Stat k="Average spend / day" ic="fa-indian-rupee-sign" t="gold" a={c.spend / Math.max(1, x.R.days)} f={(v) => inr(v)} />
        <Stat k="Average results / day" ic="fa-bullseye" t="blue" a={c.results / Math.max(1, x.R.days)} f={(v) => v.toFixed(1)} />
        <Stat k="Average leads / day" ic="fa-user-plus" t="green" a={c.leads / Math.max(1, x.R.days)} f={(v) => v.toFixed(1)} />
        <Stat k="Cheapest day" ic="fa-trophy" t="violet" a={best ? cpr(best) : 0} f={(v) => (v ? inr(v, 2) : "—")} sub={best ? short(best.date) : ""} />
      </div>
      <Section title="Spend & leads per day" icon="fa-chart-column" sub="Top = spend · bottom = leads in panel · hover a day">
        <DayChart series={x.series} />
      </Section>
      <Section title="Every day" icon="fa-table" sub="Newest first">
        <div className="rp-tw">
          <table className="rp-t">
            <thead><tr><th>Date</th><th>Spend</th><th className="r">Facebook</th><th className="r">Instagram</th><th className="r">Impr.</th><th className="r">Clicks</th><th className="r">Results</th><th className="r">Cost / result</th><th className="r">Leads</th><th className="r">Clients</th></tr></thead>
            <tbody>
              {pr.map((s) => (
                <tr key={s.date} className={s.spend || s.leads ? "" : "zero"}>
                  <td className="b nw">{short(s.date)} <small className="mut">{WDL[(new Date(`${s.date}T12:00:00`).getDay() + 6) % 7].slice(0, 3)}</small></td>
                  <td className="rp-barcell"><span className="rp-inbar"><i style={{ width: `${(s.spend / max) * 100}%` }} /></span><b>{inr(s.spend)}</b></td>
                  <td className="r">{inr(s.fbSpend)}</td>
                  <td className="r">{inr(s.igSpend)}</td>
                  <td className="r">{compact(s.impr)}</td>
                  <td className="r">{compact(s.clicks)}</td>
                  <td className="r">{num(s.results)}</td>
                  <td className="r">{s.results ? inr(cpr(s), 2) : "—"}</td>
                  <td className="r b">{num(s.leads)}</td>
                  <td className="r">{num(s.conv)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="b">{inr(c.spend)}</td><td className="r">{inr(c.fbSpend)}</td><td className="r">{inr(c.igSpend)}</td><td className="r">{compact(c.impr)}</td><td className="r">{compact(c.clicks)}</td><td className="r">{num(c.results)}</td><td className="r">{cpr(c) ? inr(cpr(c), 2) : "—"}</td><td className="r">{num(c.leads)}</td><td className="r">{num(c.conv)}</td></tr></tfoot>
          </table>
        </div>
        {pager}
      </Section>
    </>
  );
}

function Monthly({ x }) {
  const ms = x.months;
  const max = Math.max(1, ...ms.map((m) => m.spend));
  /* naya mahina upar; har mahine ke saath uska pichhla mahina (badla kitna) */
  const listM = useMemo(() => { const r = [...ms].reverse(); return r.map((m, i) => ({ ...m, older: r[i + 1] })); }, [ms]);
  const { rows: pm, pager } = usePager(listM);
  const withData = ms.filter((m) => m.spend || m.leads);
  const tot = ms.reduce((a, m) => ({ spend: a.spend + m.spend, results: a.results + m.results, leads: a.leads + m.leads, conv: a.conv + m.conv, funded: a.funded + m.funded }), { spend: 0, results: 0, leads: 0, conv: 0, funded: 0 });
  return (
    <>
      <div className="rp-kpis four">
        <Stat k="12-month spend" ic="fa-indian-rupee-sign" t="gold" a={tot.spend} f={(v) => inr(v)} />
        <Stat k="12-month leads" ic="fa-user-plus" t="green" a={tot.leads} f={num} />
        <Stat k="12-month clients" ic="fa-handshake" t="aqua" a={tot.conv} f={num} />
        <Stat k="Average spend / month" ic="fa-calendar" t="blue" a={withData.length ? tot.spend / withData.length : 0} f={(v) => inr(v)} sub={`${withData.length} active month${withData.length === 1 ? "" : "s"}`} />
      </div>
      <Section title="Spend by month" icon="fa-chart-column" sub="Hover a bar for the month">
        <div className="rp-mbars">
          {ms.map((m, i) => (
            <div key={m.month} className="rp-mbar" title={`${monthName(m.month)} · ${inr(m.spend)} · ${num(m.leads)} leads`}>
              <span className="rp-mbar-v">{m.spend ? compact(m.spend, true) : ""}</span>
              <span className="rp-mbar-c"><i style={{ height: `${(m.spend / max) * 100}%`, animationDelay: `${i * 40}ms` }} className={i === ms.length - 1 ? "now" : ""} /></span>
              <span className="rp-mbar-l">{MON[Number(m.month.slice(5)) - 1]}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Every month" icon="fa-table" sub="Newest first">
        <div className="rp-tw">
          <table className="rp-t">
            <thead><tr><th>Month</th><th className="r">Spend</th><th className="r">Results</th><th className="r">Cost / result</th><th className="r">Leads</th><th className="r">Cost / lead</th><th className="r">Clients</th><th className="r">Lead → client</th><th className="r">Added to Meta</th></tr></thead>
            <tbody>
              {pm.map((m) => {
                const older = m.older;
                const ch = older && older.spend ? pct(m.spend - older.spend, older.spend) : null;
                return (
                  <tr key={m.month} className={m.spend || m.leads ? "" : "zero"}>
                    <td className="b nw">{monthName(m.month)}</td>
                    <td className="r b">{inr(m.spend)}{ch !== null && m.spend ? <small className={`rp-ch ${ch >= 0 ? "up" : "down"}`}>{ch >= 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(0)}%</small> : null}</td>
                    <td className="r">{num(m.results)}</td>
                    <td className="r">{m.results ? inr(cpr(m), 2) : "—"}</td>
                    <td className="r">{num(m.leads)}</td>
                    <td className="r">{m.leads && m.spend ? inr(cpl(m), 2) : "—"}</td>
                    <td className="r">{num(m.conv)}</td>
                    <td className="r">{m.leads ? `${pct(m.conv, m.leads).toFixed(1)}%` : "—"}</td>
                    <td className="r">{m.funded ? inr(m.funded) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>12 months</td><td className="r">{inr(tot.spend)}</td><td className="r">{num(tot.results)}</td><td className="r">{tot.results ? inr(tot.spend / tot.results, 2) : "—"}</td><td className="r">{num(tot.leads)}</td><td className="r">{tot.leads ? inr(tot.spend / tot.leads, 2) : "—"}</td><td className="r">{num(tot.conv)}</td><td className="r">{tot.leads ? `${pct(tot.conv, tot.leads).toFixed(1)}%` : "—"}</td><td className="r">{inr(tot.funded)}</td></tr></tfoot>
          </table>
        </div>
        {pager}
      </Section>
    </>
  );
}

function Platform({ x }) {
  const c = x.cur;
  const fb = { spend: c.fbSpend, impr: c.fbImpr, clicks: c.fbClicks, results: c.fbRes, leads: c.fbLeads };
  const ig = { spend: c.igSpend, impr: c.igImpr, clicks: c.igClicks, results: c.igRes, leads: c.igLeads };
  if (!fb.spend && !ig.spend) return <Section title="Facebook vs Instagram" icon="fa-scale-balanced"><Empty text="No Meta spend in this period." /></Section>;
  const metrics = [
    ["Spend", fb.spend, ig.spend, (v) => inr(v), "neutral"],
    ["Impressions", fb.impr, ig.impr, (v) => compact(v), "up"],
    ["Link clicks", fb.clicks, ig.clicks, (v) => compact(v), "up"],
    ["CTR", pct(fb.clicks, fb.impr), pct(ig.clicks, ig.impr), (v) => `${v.toFixed(2)}%`, "up"],
    ["Results", fb.results, ig.results, num, "up"],
    ["Cost per result", fb.results ? fb.spend / fb.results : 0, ig.results ? ig.spend / ig.results : 0, (v) => (v ? inr(v, 2) : "—"), "down"],
    ["Cost per 1,000 views", fb.impr ? (fb.spend / fb.impr) * 1000 : 0, ig.impr ? (ig.spend / ig.impr) * 1000 : 0, (v) => (v ? inr(v, 2) : "—"), "down"],
    ["Leads in panel", fb.leads, ig.leads, num, "up"],
  ];
  const fbC = fb.results ? fb.spend / fb.results : 0; const igC = ig.results ? ig.spend / ig.results : 0;
  const cheap = fbC && igC ? (fbC <= igC ? "Facebook" : "Instagram") : "";
  const gap = fbC && igC ? Math.abs(pct(fbC - igC, Math.max(fbC, igC))) : 0;
  return (
    <>
      <div className="rp-vs">
        {[["Facebook", "fa-brands fa-facebook-f", FB, fb], ["Instagram", "fa-brands fa-instagram", IG, ig]].map(([name, ic, col, t]) => (
          <div key={name} className={`rp-card rp-vs-c${cheap === name ? " win" : ""}`} style={{ "--pc": col }}>
            <div className="rp-vs-h"><span className="rp-vs-ic"><i className={ic} /></span><b>{name}</b>{cheap === name && gap >= 3 ? <em><i className="fa-solid fa-crown" /> Cheaper</em> : null}</div>
            <div className="rp-vs-big">{inr(t.spend)}<small>{pct(t.spend, c.spend).toFixed(0)}% of spend</small></div>
            <div className="rp-vs-row"><span>Results</span><b>{num(t.results)}</b></div>
            <div className="rp-vs-row"><span>Cost per result</span><b>{t.results ? inr(t.spend / t.results, 2) : "—"}</b></div>
            <div className="rp-vs-row"><span>CTR</span><b>{pct(t.clicks, t.impr).toFixed(2)}%</b></div>
          </div>
        ))}
      </div>
      <div className="rp-card rp-verdict small">
        <div className="rp-verdict-ic"><i className="fa-solid fa-scale-balanced" /></div>
        <div><b>{!cheap ? "Not enough results to compare" : gap < 3 ? "Both cost about the same per result" : `${cheap} gives results ${gap.toFixed(0)}% cheaper`}</b>
          <p>{cheap ? `Facebook ${inr(fbC, 2)} vs Instagram ${inr(igC, 2)} per result in this period.` : "Each platform needs results in this period."}</p></div>
      </div>
      <Section title="Side by side" icon="fa-table" sub="Highlighted = the better one">
        <div className="rp-tw">
          <table className="rp-t rp-cmp">
            <thead><tr><th>Metric</th><th className="r"><i className="fa-brands fa-facebook-f" style={{ color: FB }} /> Facebook</th><th className="r"><i className="fa-brands fa-instagram" style={{ color: IG }} /> Instagram</th><th>Split</th></tr></thead>
            <tbody>
              {metrics.map(([k, a, b, f, good]) => {
                const win = good === "neutral" || !a || !b ? "" : (good === "up" ? a > b : a < b) ? "a" : a === b ? "" : "b";
                const tot = a + b;
                return (
                  <tr key={k}>
                    <td className="b">{k}</td>
                    <td className={`r${win === "a" ? " win" : ""}`}>{f(a)}</td>
                    <td className={`r${win === "b" ? " win" : ""}`}>{f(b)}</td>
                    <td><span className="rp-split"><i style={{ width: `${tot ? (a / tot) * 100 : 50}%`, background: FB }} /><i style={{ width: `${tot ? (b / tot) * 100 : 50}%`, background: IG }} /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

function Leads({ x }) {
  const c = x.cur;
  const maxSt = Math.max(1, ...x.stages.map((s) => s.leads));
  const maxWd = Math.max(1, ...x.weekday);
  return (
    <>
      <div className="rp-kpis four">
        <Stat k="Leads in panel" ic="fa-user-plus" t="green" a={c.leads} f={num} sub={`${(c.leads / Math.max(1, x.R.days)).toFixed(1)} per day`} />
        <Stat k="Clients won" ic="fa-handshake" t="aqua" a={c.conv} f={num} sub={`${pct(c.conv, c.leads).toFixed(1)}% of leads`} />
        <Stat k="Duplicates" ic="fa-clone" t="gold" a={x.dup} f={num} sub={`${pct(x.dup, c.leads).toFixed(1)}% of leads`} />
        <Stat k="Junk" ic="fa-ban" t="rose" a={x.junk} f={num} sub={`${pct(x.junk, c.leads).toFixed(1)}% of leads`} />
      </div>
      <Section title="Where leads come from" icon="fa-diagram-project" sub="Source of each lead — and how many became clients">
        <BreakTable rows={x.sources} total={c.leads} label="Source" />
      </Section>
      <Section title="What people ask for" icon="fa-briefcase" sub="Leads by service — and how many became clients">
        <BreakTable rows={x.services} total={c.leads} label="Service" />
      </Section>
      <div className="rp-grid2">
        <Section title="Pipeline" icon="fa-filter" sub="Where leads are right now">
          <div className="rp-stages">
            {x.stages.map((s, i) => (
              <div key={s.name} className="rp-stage">
                <span className="rp-stage-n">{s.name}</span>
                <span className="rp-stage-b"><i style={{ width: `${(s.leads / maxSt) * 100}%`, background: CAT[i % CAT.length], animationDelay: `${i * 60}ms` }} /></span>
                <b>{num(s.leads)}</b><small>{pct(s.leads, c.leads).toFixed(0)}%</small>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Leads by weekday" icon="fa-calendar-week" sub="Plan calling shifts around the busy days">
          <div className="rp-wd">
            {x.weekday.map((v, i) => (
              <div key={i} className={`rp-wd-c${v === maxWd && v ? " top" : ""}`}>
                <span className="rp-wd-v">{num(v)}</span>
                <span className="rp-wd-bar"><i style={{ height: `${(v / maxWd) * 100}%`, animationDelay: `${i * 50}ms` }} /></span>
                <span className="rp-wd-l">{WDL[i].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Team" icon="fa-user-tie" sub="Leads per person and how many they converted">
        <BreakTable rows={x.staff} total={c.leads} label="Assigned to" showConv />
      </Section>
    </>
  );
}

function BreakTable({ rows, total, label, showConv }) {
  const { rows: pr, offset, pager } = usePager(rows);
  if (!rows.length) return <Empty text="No leads in this period." />;
  return (
    <>
    <div className="rp-tw">
      <table className="rp-t">
        <thead><tr><th>{label}</th><th className="r">Leads</th><th>Share</th>{showConv ? <th className="r">Contacted</th> : null}<th className="r">Clients</th><th className="r">Conv.</th><th className="r">Dup.</th></tr></thead>
        <tbody>
          {pr.map((r, j) => { const i = offset + j; return (
            <tr key={r.name}>
              <td className="b nw"><span className="rp-dot" style={{ background: CAT[i % CAT.length] }} />{r.name}</td>
              <td className="r b">{num(r.leads)}</td>
              <td className="rp-sharecell"><span className="rp-share wide"><i style={{ width: `${pct(r.leads, total)}%`, background: CAT[i % CAT.length] }} /></span><small>{pct(r.leads, total).toFixed(0)}%</small></td>
              {showConv ? <td className="r">{num(r.contacted)}</td> : null}
              <td className="r">{num(r.conv)}</td>
              <td className="r">{r.leads ? `${pct(r.conv, r.leads).toFixed(1)}%` : "—"}</td>
              <td className="r mut">{num(r.dup)}</td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
    {pager}
    </>
  );
}

function Billing({ x }) {
  const b = x.bill;
  const { rows: pb, pager } = usePager(b.rows);
  const ST = { Funded: "fa-arrow-down", Paid: "fa-check", Failed: "fa-xmark", Refunded: "fa-rotate-left", Pending: "fa-clock" };
  return (
    <>
      <div className="rp-kpis four">
        <Stat k="Money added" ic="fa-arrow-down" t="blue" a={b.funded} f={(v) => inr(v)} sub={`${b.fundedN} payment${b.fundedN === 1 ? "" : "s"}`} />
        <Stat k="Paid for ads" ic="fa-check" t="green" a={b.paidAds} f={(v) => inr(v)} sub="Taken from the balance" />
        <Stat k="Failed payments" ic="fa-xmark" t="rose" a={b.failed} f={num} sub={b.failed ? inr(b.failedAmt) : "None"} />
        <Stat k="Ad spend (Meta)" ic="fa-indian-rupee-sign" t="gold" a={x.cur.spend} f={(v) => inr(v)} sub="From Campaigns" />
      </div>
      <Section title="Payment activity" icon="fa-receipt" sub="Same as Meta → Billing & payments" right={<a className="rp-link" href="/ad-wallet">Open Ad Wallet <i className="fa-solid fa-arrow-right" /></a>}>
        {b.rows.length ? (
          <div className="rp-tw">
            <table className="rp-t">
              <thead><tr><th>Date</th><th>Account</th><th className="r">Amount</th><th>Payment method</th><th>Status</th></tr></thead>
              <tbody>
                {pb.map((r) => {
                  const s = b.status(r);
                  return (
                    <tr key={r.id}>
                      <td className="b nw">{short(String(r.date).slice(0, 10))}{r.time ? <small className="mut"> {new Date(r.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</small> : null}</td>
                      <td>{r.account || "—"}</td>
                      <td className="r b">{inr(r.amount, 2)}</td>
                      <td>{r.method || r.payMode || "—"}</td>
                      <td><span className={`rp-st s-${s.toLowerCase()}`}><i className={`fa-solid ${ST[s] || "fa-circle"}`} /> {s}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {b.rows.length ? pager : <Empty text="No payments in this period. Payments come from Ad Wallet automatically." />}
      </Section>
    </>
  );
}

/* ============================================================
   Pieces
   ============================================================ */
function diffWord(a, b) {
  if (!b) return "new";
  const c = pct(a - b, b);
  if (Math.abs(c) < 1) return "about the same";
  return `${Math.abs(c).toFixed(0)}% ${c > 0 ? "higher" : "lower"}`;
}

function Stat({ k, ic, t, a, b, f, good = "up", sub }) {
  const has = typeof b === "number" && b > 0;
  const ch = has ? pct(a - b, b) : null;
  const flat = ch !== null && Math.abs(ch) < 0.5;
  const cls = ch === null || flat ? "flat" : good === "neutral" ? "neutral" : (good === "down" ? ch < 0 : ch > 0) ? "good" : "bad";
  return (
    <div className={`rp-stat t-${t}`}>
      <div className="rp-stat-h"><span className="rp-stat-ic"><i className={`fa-solid ${ic}`} /></span><span>{k}</span></div>
      <div className="rp-stat-v">{f(a)}</div>
      <div className="rp-stat-f">
        {ch !== null ? <span className={`rp-d ${cls}`}><i className={`fa-solid ${flat ? "fa-minus" : ch > 0 ? "fa-arrow-up" : "fa-arrow-down"}`} /> {flat ? "same" : `${Math.abs(ch) >= 999 ? "999+" : Math.abs(ch).toFixed(0)}%`}</span> : null}
        {has ? <small>was {f(b)}</small> : sub ? <small>{sub}</small> : null}
      </div>
      {has && sub ? <small className="rp-stat-sub">{sub}</small> : null}
    </div>
  );
}

function Section({ title, icon, sub, right, children }) {
  return (
    <section className="rp-card rp-sec">
      <div className="rp-sec-h">
        <div className="rp-sec-ic"><i className={`fa-solid ${icon}`} /></div>
        <div className="rp-sec-tx"><b>{title}</b>{sub ? <small>{sub}</small> : null}</div>
        {right ? <div className="rp-sec-r">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* Pagination — table me 10 se zyada rows hon to agle page pe */
const PER = 10;
function usePager(list) {
  const [pg, setPg] = useState(1);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  useEffect(() => { setPg(1); }, [list.length]);
  const cur = Math.min(pg, pages);
  const offset = (cur - 1) * PER;
  return { rows: list.slice(offset, offset + PER), offset, pager: <Pager page={cur} pages={pages} total={list.length} offset={offset} onGo={setPg} /> };
}
function Pager({ page, pages, total, offset, onGo }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((k) => k === 1 || k === pages || Math.abs(k - page) <= 1);
  return (
    <nav className="rp-pg" aria-label="Pages">
      <span className="rp-pg-info">Showing <b>{offset + 1}–{Math.min(offset + PER, total)}</b> of <b>{total}</b></span>
      <div className="rp-pg-btns">
        <button type="button" className="rp-pg-b" disabled={page === 1} onClick={() => onGo(page - 1)} aria-label="Previous page"><i className="fa-solid fa-chevron-left" /><span>Prev</span></button>
        {nums.map((k, i) => (
          <span key={k} style={{ display: "contents" }}>
            {i > 0 && k - nums[i - 1] > 1 ? <span className="rp-pg-dots">…</span> : null}
            <button type="button" className={`rp-pg-n${k === page ? " on" : ""}`} onClick={() => onGo(k)} aria-current={k === page ? "page" : undefined}>{k}</button>
          </span>
        ))}
        <button type="button" className="rp-pg-b" disabled={page === pages} onClick={() => onGo(page + 1)} aria-label="Next page"><span>Next</span><i className="fa-solid fa-chevron-right" /></button>
      </div>
    </nav>
  );
}

function Empty({ text }) { return <div className="rp-empty"><i className="fa-regular fa-folder-open" /> {text}</div>; }

/* Do patti — upar spend, neeche leads. Dono ka apna scale, ek hi din ki line. */
function DayChart({ series }) {
  const ref = useRef(null);
  const [w, setW] = useState(700);
  const [hi, setHi] = useState(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  if (!series.some((s) => s.spend || s.leads)) return <Empty text="No spend or leads in this period." />;
  const L = 52; const Rr = 6; const A = 128; const B = 74; const gap = 26; const top = 8; const H = top + A + gap + B + 24;
  const iw = w - L - Rr;
  const slot = iw / Math.max(1, series.length);
  const bw = Math.max(2, Math.min(20, slot * 0.62));
  const maxS = Math.max(1, ...series.map((s) => s.spend));
  const maxL = Math.max(1, ...series.map((s) => s.leads));
  const yA = (v) => top + A - (v / maxS) * A;
  const y0B = top + A + gap;
  const yB = (v) => y0B + B - (v / maxL) * B;
  const every = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(iw / 64))));
  const h = hi !== null ? series[hi] : null;
  return (
    <div className="rp-chart" ref={ref} onMouseLeave={() => setHi(null)}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Spend and leads per day"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - L) / slot); setHi(i >= 0 && i < series.length ? i : null); }}>
        <defs>
          <linearGradient id="rpBarA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E8A81C" /><stop offset="1" stopColor="#F6D27A" /></linearGradient>
          <linearGradient id="rpBarB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a78d6" /><stop offset="1" stopColor="#8DB8EC" /></linearGradient>
        </defs>
        <text x={0} y={top + 10} className="rp-pl">Spend</text>
        <text x={0} y={top + 24} className="rp-ax">{compact(maxS, true)}</text>
        <text x={0} y={y0B + 10} className="rp-pl">Leads</text>
        <text x={0} y={y0B + 24} className="rp-ax">{num(maxL)}</text>
        <line x1={L} x2={w - Rr} y1={top} y2={top} className="rp-gl" />
        <line x1={L} x2={w - Rr} y1={top + A} y2={top + A} className="rp-base" />
        <line x1={L} x2={w - Rr} y1={y0B} y2={y0B} className="rp-gl" />
        <line x1={L} x2={w - Rr} y1={y0B + B} y2={y0B + B} className="rp-base" />
        {series.map((s, i) => {
          const x0 = L + slot * i;
          return (
            <g key={s.date}>
              {hi === i ? <rect x={x0} y={top} width={slot} height={y0B + B - top} className="rp-colhi" /> : null}
              <rect x={x0 + (slot - bw) / 2} y={yA(s.spend)} width={bw} height={Math.max(0, top + A - yA(s.spend))} rx={Math.min(3, bw / 2)} fill="url(#rpBarA)" className="rp-bar" style={{ animationDelay: `${Math.min(i * 12, 400)}ms` }} />
              <rect x={x0 + (slot - bw) / 2} y={yB(s.leads)} width={bw} height={Math.max(0, y0B + B - yB(s.leads))} rx={Math.min(3, bw / 2)} fill="url(#rpBarB)" className="rp-bar" style={{ animationDelay: `${Math.min(i * 12 + 60, 460)}ms` }} />
              {(i % every === 0 && series.length - 1 - i >= every * 0.6) || i === series.length - 1 ? <text x={x0 + slot / 2} y={H - 6} textAnchor="middle" className="rp-ax">{short(s.date).replace(/ \d{4}$/, "")}</text> : null}
            </g>
          );
        })}
      </svg>
      {h ? (
        <div className="rp-tip" style={{ left: Math.min(Math.max(L + slot * hi + slot / 2, 90), w - 90) }}>
          <b>{short(h.date)}</b>
          <span><i style={{ background: "#E8A81C" }} />Spend <em>{inr(h.spend)}</em></span>
          <span><i style={{ background: "#2a78d6" }} />Leads <em>{num(h.leads)}</em></span>
          <span><i style={{ background: "#C9CEDA" }} />Results <em>{num(h.results)}</em></span>
        </div>
      ) : null}
    </div>
  );
}

function PeriodPick({ period, R, onPick, cf, ct, setCf, setCt }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", off); return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const P = PERIODS.find((x) => x.key === period);
  return (
    <div className="rp-per" ref={ref}>
      <button type="button" className="gd-per-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <i className="fa-regular fa-calendar" />
        <span className="gd-per-l"><b>{P.label}</b><small>{short(R.from)}{R.from !== R.to ? ` – ${short(R.to)}` : ""}</small></span>
        <i className="fa-solid fa-chevron-down gd-per-cv" />
      </button>
      {open ? (
        <div className="gd-per-menu rp-per-menu" role="listbox">
          {PERIODS.map((p) => {
            const r = p.key === "custom" ? null : periodDates(p.key);
            return (
              <button key={p.key} type="button" className={period === p.key ? "on" : ""} onClick={() => { onPick(p.key); if (p.key !== "custom") setOpen(false); }}>
                <span><b>{p.label}</b><small>{r ? `${short(r.from)}${r.from !== r.to ? ` – ${short(r.to)}` : ""} · ${r.days} days` : "Pick your own dates"}</small></span>
                {period === p.key ? <i className="fa-solid fa-check" /> : null}
              </button>
            );
          })}
          {period === "custom" ? (
            <div className="rp-custom">
              <input type="date" className="form-control" value={cf} onChange={(e) => setCf(e.target.value)} aria-label="From" />
              <span>to</span>
              <input type="date" className="form-control" value={ct} onChange={(e) => setCt(e.target.value)} aria-label="To" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
