"use client";

/* ============================================================
   components/ByTimeTab.js — Campaigns → "By Time"

   Din ke kis waqt kitni leads aati hain — Meta ke hourly breakdown se
   (ghanta ad account ke time zone me, IST).
   Filter: period · campaigns (ek saath kai) · sirf chal rahe campaigns.
     · Upar: kul leads, sabse zyada leads wala ghanta, sabse sasta ghanta
     · Subah / Dopahar / Shaam / Raat ka hissa
     · 24 ghante ka chart + table (leads, chats, kharch, cost per lead)
   ============================================================ */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { TablePager } from "./Pager";

const CACHE = "vk_meta_hours";
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "90", label: "Last 90 days" },
];
const SLOTS = [
  { key: "morning", label: "Morning", hint: "6 AM – 12 PM", icon: "fa-sun", color: "#D9970F", hours: [6, 7, 8, 9, 10, 11] },
  { key: "afternoon", label: "Afternoon", hint: "12 PM – 5 PM", icon: "fa-cloud-sun", color: "#E2621B", hours: [12, 13, 14, 15, 16] },
  { key: "evening", label: "Evening", hint: "5 PM – 9 PM", icon: "fa-cloud-moon", color: "#7C3AED", hours: [17, 18, 19, 20] },
  { key: "night", label: "Night", hint: "9 PM – 6 AM", icon: "fa-moon", color: "#334155", hours: [21, 22, 23, 0, 1, 2, 3, 4, 5] },
];

const z = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
function rangeOf(key) {
  const to = new Date(); const from = new Date();
  if (key === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
  else if (key === "month") from.setDate(1);
  else if (key !== "today") from.setDate(from.getDate() - (Number(key) - 1));
  return { since: iso(from), until: iso(to) };
}
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
const hourRange = (h) => `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`;
const inr = (v, d = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: d, minimumFractionDigits: d }).format(Number(v) || 0);
const num = (v) => new Intl.NumberFormat("en-IN").format(Math.round(Number(v) || 0));
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || "{}"); } catch { return {}; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* */ } };

export default function ByTimeTab({ tab }) {
  const [period, setPeriod] = useState("7");
  const [camps, setCamps] = useState([]);       /* khaali = saare */
  const [running, setRunning] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [local, setLocal] = useState({ camps: [], accounts: [] });

  useEffect(() => {
    const load = () => setLocal({ camps: readRows("campaigns__live-ads"), accounts: readRows("ad-accounts__accounts") });
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  async function fetchData(force = false) {
    const R = rangeOf(period);
    const cache = readCache();
    const hit = cache[period];
    if (!force && hit && hit.since === R.since && hit.until === R.until && Date.now() - Date.parse(hit.at || 0) < 30 * 60000) { setData(hit); return; }
    const ids = [...new Set(local.accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/hour-of-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, ...R }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Could not load hour-wise data from Meta");
      else { setData(j); writeCache({ ...cache, [period]: j }); }
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (local.accounts.length) fetchData(); }, [period, local.accounts.length]);

  const activeIds = useMemo(() => new Set(local.camps.filter((c) => String(c.status) === "Active" && c.extId).map((c) => String(c.extId))), [local.camps]);

  const v = useMemo(() => {
    if (!data) return null;
    const rows = (data.rows || []).filter((r) => !running || activeIds.has(r.campaignId) || !activeIds.size);
    const campList = [...new Map(rows.map((r) => [r.campaignId, r.campaign])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const mine = camps.length ? rows.filter((r) => camps.includes(r.campaignId)) : rows;
    const hours = Array.from({ length: 24 }, (_, h) => ({ h, leads: 0, chats: 0, spend: 0, impressions: 0 }));
    mine.forEach((r) => { const x = hours[r.hour]; if (!x) return; x.leads += r.leads; x.chats += r.chats; x.spend += r.spend; x.impressions += r.impressions; });
    const tot = hours.reduce((t, x) => ({ leads: t.leads + x.leads, chats: t.chats + x.chats, spend: t.spend + x.spend }), { leads: 0, chats: 0, spend: 0 });
    const peak = tot.leads ? hours.reduce((a, x) => (x.leads > a.leads ? x : a)) : null;
    const withLeads = hours.filter((x) => x.leads >= 3);
    const cheapest = withLeads.length ? withLeads.reduce((a, x) => (x.spend / x.leads < a.spend / a.leads ? x : a)) : null;
    const slots = SLOTS.map((s) => {
      const t = s.hours.reduce((m, h) => ({ leads: m.leads + hours[h].leads, chats: m.chats + hours[h].chats, spend: m.spend + hours[h].spend }), { leads: 0, chats: 0, spend: 0 });
      return { ...s, ...t };
    });
    return { campList, hours, tot, peak, cheapest, slots };
  }, [data, camps, running, activeIds]);

  const R = rangeOf(period);
  const maxH = Math.max(1, ...(v?.hours || []).map((x) => x.leads));
  const bestSlot = v ? v.slots.reduce((a, s) => (s.leads > a.leads ? s : a), v.slots[0]) : null;

  return (
    <div className="st">
      <div className="lf-head">
        <div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div>
        <div className="lf-acts">
          {data?.at ? <span className="lf-at"><i className="fa-solid fa-rotate" /> Loaded {new Date(data.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          <button type="button" className="btn btn-gold" disabled={busy} onClick={() => fetchData(true)}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {busy ? "Loading from Meta..." : "Refresh from Meta"}
          </button>
        </div>
      </div>

      {/* ---- filters ---- */}
      <div className="st-filters">
        <label className="st-sel"><i className="fa-regular fa-calendar" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        <MultiPick
          icon="fa-bullhorn" noun="campaigns" allLabel={`All ${running ? "running " : ""}campaigns`}
          options={(v?.campList || []).map(([id, name]) => ({ id, label: name }))}
          value={camps} onChange={setCamps}
        />
        <label className="st-check"><input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} /> Running campaigns only</label>
        {camps.length ? <button type="button" className="ph-clear" onClick={() => setCamps([])}>Clear</button> : null}
      </div>

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
      {data?.errors?.length ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> {data.errors.map((e) => e.message).join(" · ")}</div> : null}

      {!v ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-clock"}`} /><b>{busy ? "Reading hour-wise data from Meta..." : "No data yet"}</b><span>Press "Refresh from Meta".</span></div></div>
      ) : (
        <>
          {/* ---- summary ---- */}
          <div className="lf-stats">
            <div><span>Form leads</span><b>{num(v.tot.leads)}</b><em>{R.since === R.until ? R.since : `${R.since} → ${R.until}`}</em></div>
            <div><span>Peak hour</span><b className="st-txt">{v.peak ? hourRange(v.peak.h) : "—"}</b><em>{v.peak ? `${num(v.peak.leads)} leads · ${pct(v.peak.leads, v.tot.leads).toFixed(0)}%` : ""}</em></div>
            <div><span>Cheapest hour</span><b className="st-txt">{v.cheapest ? hourRange(v.cheapest.h) : "—"}</b><em>{v.cheapest ? `${inr(v.cheapest.spend / v.cheapest.leads, 2)} per lead` : "needs 3+ leads in an hour"}</em></div>
            <div><span>Best time of day</span><b className="st-txt">{bestSlot?.leads ? bestSlot.label : "—"}</b><em>{bestSlot?.leads ? `${bestSlot.hint} · ${pct(bestSlot.leads, v.tot.leads).toFixed(0)}%` : ""}</em></div>
          </div>

          {/* ---- time of day ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {v.slots.map((s) => (
              <div key={s.key} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${s.color} 14%, #fff)`, color: s.color, fontSize: 13 }}><i className={`fa-solid ${s.icon}`} /></span>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <b style={{ fontSize: 13 }}>{s.label}</b>
                    <small style={{ fontSize: 11, color: "#7A8295" }}>{s.hint}</small>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <b style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{num(s.leads)}</b>
                  <small style={{ fontSize: 11.5, color: "#5B6478", fontWeight: 600 }}>leads · {pct(s.leads, v.tot.leads).toFixed(0)}%</small>
                </div>
                <span style={{ height: 6, borderRadius: 99, background: "#EEF0F5", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${pct(s.leads, v.tot.leads)}%`, background: s.color, borderRadius: 99 }} /></span>
                <small style={{ fontSize: 11.5, color: "#5B6478" }}>{num(s.chats)} chats · {inr(s.spend)} spend · {s.leads ? `${inr(s.spend / s.leads, 2)}/lead` : "—"}</small>
              </div>
            ))}
          </div>

          {/* ---- 24 hour chart ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-chart-column" /></span>
              <div><b>Leads by hour</b><small>{camps.length === 1 ? v.campList.find(([id]) => id === camps[0])?.[1] : camps.length ? `${camps.length} campaigns` : "All campaigns"} · hover a bar for details</small></div>
            </div>
            <div style={{ padding: "8px 18px 16px", overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, minmax(22px, 1fr))", gap: 5, alignItems: "end", height: 170, minWidth: 600 }}>
                {v.hours.map((x) => (
                  <div key={x.h} title={`${hourRange(x.h)}\n${num(x.leads)} form leads · ${num(x.chats)} chats\n${inr(x.spend, 2)} spend${x.leads ? ` · ${inr(x.spend / x.leads, 2)}/lead` : ""}`}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                    <small style={{ fontSize: 10, fontWeight: 700, color: x.leads ? "#1B2333" : "#B8BDC9" }}>{x.leads ? num(x.leads) : ""}</small>
                    <span style={{ width: "100%", height: `${Math.max(2, (x.leads / maxH) * 130)}px`, borderRadius: "6px 6px 2px 2px", background: v.peak && x.h === v.peak.h ? "linear-gradient(180deg,#F2B632,#D9970F)" : "linear-gradient(180deg,#7FA6F5,#3B6FE0)", opacity: x.leads ? 1 : 0.25 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, minmax(22px, 1fr))", gap: 5, minWidth: 600, marginTop: 6 }}>
                {v.hours.map((x) => <small key={x.h} style={{ fontSize: 9.5, color: "#7A8295", textAlign: "center", whiteSpace: "nowrap" }}>{x.h % 3 === 0 ? hourLabel(x.h) : ""}</small>)}
              </div>
            </div>
          </section>

          {/* ---- table ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-clock" /></span>
              <div><b>Hour by hour</b><small>Form leads, chats, spend and cost per lead for every hour</small></div>
            </div>
            <div className="tbl-scroll">
              <table className="mod-table st-t">
                <thead><tr><th>Time</th><th className="ta-r">Form leads</th><th>Share</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th></tr></thead>
                <tbody>
                  {v.hours.map((x) => (
                    <tr key={x.h} style={v.peak && x.h === v.peak.h ? { background: "#FFFBF0" } : undefined}>
                      <td><b>{hourRange(x.h)}</b>{v.peak && x.h === v.peak.h ? <span className="mx-tag" style={{ marginLeft: 8 }}>Peak</span> : null}</td>
                      <td className="ta-r"><b>{num(x.leads)}</b></td>
                      <td><span className="st-bar"><i style={{ width: `${(x.leads / maxH) * 100}%` }} /></span><small className="mut"> {pct(x.leads, v.tot.leads).toFixed(1)}%</small></td>
                      <td className="ta-r">{num(x.chats)}</td>
                      <td className="ta-r">{inr(x.spend, 2)}</td>
                      <td className="ta-r">{x.leads ? inr(x.spend / x.leads, 2) : <span className="mut">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="st-note"><i className="fa-solid fa-circle-info" /> Time is the hour the lead came in, in your ad account&apos;s time zone (IST). For longer periods, the same hour of every day is added together.</p>
        </>
      )}
    </div>
  );
}

/* ============================================================
   ByPagesTab — Campaigns → "By Pages"
   Kis Facebook Page ke ads se kitni leads aayi. Filter wahi: period ·
   campaigns (ek saath kai) · sirf chal rahe campaigns. Page pe click →
   us Page ke campaigns.
   ============================================================ */
const PCACHE = "vk_meta_pages";
export function ByPagesTab({ tab }) {
  const [period, setPeriod] = useState("7");
  const [camps, setCamps] = useState([]);
  const [running, setRunning] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState("");          /* khula hua Page */
  const [local, setLocal] = useState({ camps: [], accounts: [] });

  useEffect(() => {
    const load = () => setLocal({ camps: readRows("campaigns__live-ads"), accounts: readRows("ad-accounts__accounts") });
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  async function fetchData(force = false) {
    const R = rangeOf(period);
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(PCACHE) || "{}"); } catch { cache = {}; }
    const hit = cache[period];
    if (!force && hit && hit.since === R.since && hit.until === R.until && Date.now() - Date.parse(hit.at || 0) < 30 * 60000) { setData(hit); return; }
    const ids = [...new Set(local.accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/hour-of-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, ...R, by: "page" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Could not load page-wise data from Meta");
      else { setData(j); try { localStorage.setItem(PCACHE, JSON.stringify({ ...cache, [period]: j })); } catch { /* */ } }
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (local.accounts.length) fetchData(); }, [period, local.accounts.length]);

  const activeIds = useMemo(() => new Set(local.camps.filter((c) => String(c.status) === "Active" && c.extId).map((c) => String(c.extId))), [local.camps]);

  const v = useMemo(() => {
    if (!data) return null;
    const rows = (data.rows || []).filter((r) => !running || activeIds.has(r.campaignId) || !activeIds.size);
    const campList = [...new Map(rows.map((r) => [r.campaignId, r.campaign])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const mine = camps.length ? rows.filter((r) => camps.includes(r.campaignId)) : rows;
    const pages = new Map();
    mine.forEach((r) => {
      const k = r.pageId || "—";
      const p = pages.get(k) || { id: k, name: r.page, leads: 0, chats: 0, spend: 0, impressions: 0, ads: 0, camps: [] };
      p.leads += r.leads; p.chats += r.chats; p.spend += r.spend; p.impressions += r.impressions; p.ads += r.ads;
      p.camps.push(r);
      pages.set(k, p);
    });
    const list = [...pages.values()].sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    const tot = list.reduce((t, p) => ({ leads: t.leads + p.leads, chats: t.chats + p.chats, spend: t.spend + p.spend }), { leads: 0, chats: 0, spend: 0 });
    const withLeads = list.filter((p) => p.leads >= 3);
    const cheapest = withLeads.length ? withLeads.reduce((a, p) => (p.spend / p.leads < a.spend / a.leads ? p : a)) : null;
    return { campList, list, tot, top: list[0]?.leads ? list[0] : null, cheapest };
  }, [data, camps, running, activeIds]);

  const R = rangeOf(period);
  const maxL = Math.max(1, ...(v?.list || []).map((p) => p.leads));
  const sel = v?.list.find((p) => p.id === open) || null;

  return (
    <div className="st">
      <div className="lf-head">
        <div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div>
        <div className="lf-acts">
          {data?.at ? <span className="lf-at"><i className="fa-solid fa-rotate" /> Loaded {new Date(data.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          <button type="button" className="btn btn-gold" disabled={busy} onClick={() => fetchData(true)}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {busy ? "Loading from Meta..." : "Refresh from Meta"}
          </button>
        </div>
      </div>

      <div className="st-filters">
        <label className="st-sel"><i className="fa-regular fa-calendar" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        <MultiPick
          icon="fa-bullhorn" noun="campaigns" allLabel={`All ${running ? "running " : ""}campaigns`}
          options={(v?.campList || []).map(([id, name]) => ({ id, label: name }))}
          value={camps} onChange={setCamps}
        />
        <label className="st-check"><input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} /> Running campaigns only</label>
        {camps.length ? <button type="button" className="ph-clear" onClick={() => setCamps([])}>Clear</button> : null}
      </div>

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
      {data?.errors?.length ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> {data.errors.map((e) => e.message).join(" · ")}</div> : null}

      {!v ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-flag"}`} /><b>{busy ? "Reading page-wise data from Meta..." : "No data yet"}</b><span>Press "Refresh from Meta".</span></div></div>
      ) : (
        <>
          <div className="lf-stats">
            <div><span>Form leads</span><b>{num(v.tot.leads)}</b><em>{R.since === R.until ? R.since : `${R.since} → ${R.until}`}</em></div>
            <div><span>Pages with ads</span><b>{v.list.length}</b><em>{num(v.tot.chats)} chats · {inr(v.tot.spend)} spend</em></div>
            <div><span>Top page</span><b className="st-txt">{v.top ? v.top.name : "—"}</b><em>{v.top ? `${num(v.top.leads)} leads · ${pct(v.top.leads, v.tot.leads).toFixed(0)}%` : ""}</em></div>
            <div><span>Cheapest page</span><b className="st-txt">{v.cheapest ? v.cheapest.name : "—"}</b><em>{v.cheapest ? `${inr(v.cheapest.spend / v.cheapest.leads, 2)} per lead` : "needs 3+ leads"}</em></div>
          </div>

          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-flag" /></span>
              <div><b>Leads by page</b><small>{camps.length === 1 ? v.campList.find(([id]) => id === camps[0])?.[1] : camps.length ? `${camps.length} campaigns` : "All campaigns"} · click a page to see its campaigns</small></div>
            </div>
            {v.list.length ? (
              <div className="tbl-scroll">
                <table className="mod-table st-t">
                  <thead><tr><th>#</th><th>Page</th><th className="ta-r">Form leads</th><th>Share</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th><th className="ta-r">Campaigns</th><th className="ta-r">Ads</th></tr></thead>
                  <tbody>
                    {v.list.map((p, i) => (
                      <tr key={p.id} onClick={() => setOpen(open === p.id ? "" : p.id)} style={{ cursor: "pointer", background: open === p.id ? "#FFFBF0" : undefined }}>
                        <td className="mut">{i + 1}</td>
                        <td><b><i className="fa-brands fa-facebook" style={{ color: "#1877F2", marginRight: 6 }} />{p.name}</b>{p.id !== "—" ? <small className="mut" style={{ display: "block" }}>ID {p.id}</small> : null}</td>
                        <td className="ta-r"><b>{num(p.leads)}</b></td>
                        <td><span className="st-bar"><i style={{ width: `${(p.leads / maxL) * 100}%` }} /></span><small className="mut"> {pct(p.leads, v.tot.leads).toFixed(1)}%</small></td>
                        <td className="ta-r">{num(p.chats)}</td>
                        <td className="ta-r">{inr(p.spend, 2)}</td>
                        <td className="ta-r">{p.leads ? inr(p.spend / p.leads, 2) : <span className="mut">—</span>}</td>
                        <td className="ta-r">{new Set(p.camps.map((c) => c.campaignId)).size}</td>
                        <td className="ta-r">{num(p.ads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="lf-empty"><i className="fa-solid fa-flag" /><b>No ads ran in this period</b><span>Pick another period or campaign.</span></div>}
          </section>

          {sel ? (
            <section className="card st-card">
              <div className="st-card-h">
                <span className="lf-form-ic"><i className="fa-solid fa-bullhorn" /></span>
                <div><b>{sel.name}</b><small>Campaigns running ads from this page</small></div>
                <button type="button" className="ph-clear" style={{ marginLeft: "auto" }} onClick={() => setOpen("")}>Close</button>
              </div>
              <div className="tbl-scroll">
                <table className="mod-table st-t">
                  <thead><tr><th>Campaign</th><th className="ta-r">Form leads</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th><th className="ta-r">Ads</th></tr></thead>
                  <tbody>
                    {[...sel.camps].sort((a, b) => b.leads - a.leads || b.spend - a.spend).map((c) => (
                      <tr key={c.campaignId}>
                        <td><b>{c.campaign}</b></td>
                        <td className="ta-r"><b>{num(c.leads)}</b></td>
                        <td className="ta-r">{num(c.chats)}</td>
                        <td className="ta-r">{inr(c.spend, 2)}</td>
                        <td className="ta-r">{c.leads ? inr(c.spend / c.leads, 2) : <span className="mut">—</span>}</td>
                        <td className="ta-r">{num(c.ads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <p className="st-note"><i className="fa-solid fa-circle-info" /> The page is the Facebook Page each ad runs from. Leads come from Meta for the chosen period; one campaign can run ads from more than one page.</p>
        </>
      )}
    </div>
  );
}

/* ============================================================
   ByAgeTab — Campaigns → "By Age"
   Kis umar ke log leads de rahe hain — har campaign aur ad set ka.
   Keyword search (jaise "TM") → naam me wo shabd wale saare campaigns
   + ad sets, unki kul leads aur har umar ki leads.
   ============================================================ */
const ACACHE = "vk_meta_ages";
const AGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const AGE_COLORS = { "18-24": "#7FA6F5", "25-34": "#3B6FE0", "35-44": "#1E8A54", "45-54": "#D9970F", "55-64": "#E2621B", "65+": "#7C3AED" };
export function ByAgeTab({ tab }) {
  const [period, setPeriod] = useState("7");
  const [camps, setCamps] = useState([]);
  const [running, setRunning] = useState(true);
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openC, setOpenC] = useState({});      /* kaun se campaign khule (ad sets dikhein) */
  const [local, setLocal] = useState({ camps: [], accounts: [] });

  useEffect(() => {
    const load = () => setLocal({ camps: readRows("campaigns__live-ads"), accounts: readRows("ad-accounts__accounts") });
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  async function fetchData(force = false) {
    const R = rangeOf(period);
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(ACACHE) || "{}"); } catch { cache = {}; }
    const hit = cache[period];
    if (!force && hit && hit.since === R.since && hit.until === R.until && Date.now() - Date.parse(hit.at || 0) < 30 * 60000) { setData(hit); return; }
    const ids = [...new Set(local.accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/hour-of-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, ...R, by: "age" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Could not load age-wise data from Meta");
      else { setData(j); try { localStorage.setItem(ACACHE, JSON.stringify({ ...cache, [period]: j })); } catch { /* */ } }
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (local.accounts.length) fetchData(); }, [period, local.accounts.length]);

  const activeIds = useMemo(() => new Set(local.camps.filter((c) => String(c.status) === "Active" && c.extId).map((c) => String(c.extId))), [local.camps]);

  const v = useMemo(() => {
    if (!data) return null;
    const rows = (data.rows || []).filter((r) => !running || activeIds.has(r.campaignId) || !activeIds.size);
    const campList = [...new Map(rows.map((r) => [r.campaignId, r.campaign])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    let mine = camps.length ? rows.filter((r) => camps.includes(r.campaignId)) : rows;
    /* Keyword — campaign ya ad set ke naam me (jaise "TM") */
    const t = q.trim().toLowerCase();
    if (t) mine = mine.filter((r) => `${r.campaign} ${r.adset}`.toLowerCase().includes(t));
    const blank = () => ({ leads: 0, chats: 0, spend: 0, ages: {} });
    const add = (o, r) => {
      o.leads += r.leads; o.chats += r.chats; o.spend += r.spend;
      const a = o.ages[r.age] || (o.ages[r.age] = { leads: 0, chats: 0, spend: 0 });
      a.leads += r.leads; a.chats += r.chats; a.spend += r.spend;
    };
    const tot = blank();
    const cmap = new Map();
    mine.forEach((r) => {
      add(tot, r);
      const c = cmap.get(r.campaignId) || { id: r.campaignId, name: r.campaign, ...blank(), sets: new Map() };
      add(c, r);
      const st = c.sets.get(r.adsetId) || { id: r.adsetId, name: r.adset, ...blank() };
      add(st, r);
      c.sets.set(r.adsetId, st);
      cmap.set(r.campaignId, c);
    });
    const list = [...cmap.values()].map((c) => ({ ...c, sets: [...c.sets.values()].sort((a, b) => b.leads - a.leads || b.spend - a.spend) }))
      .sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    const ageKeys = [...new Set([...AGES, ...Object.keys(tot.ages)])].filter((k) => AGES.includes(k) || tot.ages[k]);
    const ages = ageKeys.map((k) => ({ k, ...(tot.ages[k] || { leads: 0, chats: 0, spend: 0 }) }));
    const top = tot.leads ? ages.reduce((a, x) => (x.leads > a.leads ? x : a)) : null;
    const withL = ages.filter((x) => x.leads >= 3);
    const cheapest = withL.length ? withL.reduce((a, x) => (x.spend / x.leads < a.spend / a.leads ? x : a)) : null;
    const setCount = list.reduce((n, c) => n + c.sets.length, 0);
    return { campList, list, tot, ages, ageKeys, top, cheapest, setCount };
  }, [data, camps, running, activeIds, q]);

  const R = rangeOf(period);
  const maxA = Math.max(1, ...(v?.ages || []).map((x) => x.leads));
  const cell = (o, k) => { const n = o.ages[k]?.leads || 0; return n ? num(n) : <span className="mut">–</span>; };

  return (
    <div className="st">
      <div className="lf-head">
        <div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div>
        <div className="lf-acts">
          {data?.at ? <span className="lf-at"><i className="fa-solid fa-rotate" /> Loaded {new Date(data.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          <button type="button" className="btn btn-gold" disabled={busy} onClick={() => fetchData(true)}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {busy ? "Loading from Meta..." : "Refresh from Meta"}
          </button>
        </div>
      </div>

      <div className="st-filters">
        <label className="st-sel"><i className="fa-regular fa-calendar" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        <label className={`st-sel wide${q ? " on" : ""}`} style={{ paddingRight: 10 }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keyword — e.g. TM, NGO, MFC" aria-label="Keyword"
            style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "600 13px var(--font)", color: "#1B2333" }} />
          {q ? <button type="button" onClick={() => setQ("")} aria-label="Clear search" style={{ border: 0, background: "none", cursor: "pointer", color: "#959CAE", padding: 0 }}><i className="fa-solid fa-xmark" /></button> : null}
        </label>
        <MultiPick
          icon="fa-bullhorn" noun="campaigns" allLabel={`All ${running ? "running " : ""}campaigns`}
          options={(v?.campList || []).map(([id, name]) => ({ id, label: name }))}
          value={camps} onChange={setCamps}
        />
        <label className="st-check"><input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} /> Running campaigns only</label>
        {camps.length || q ? <button type="button" className="ph-clear" onClick={() => { setCamps([]); setQ(""); }}>Clear</button> : null}
      </div>

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
      {data?.errors?.length ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> {data.errors.map((e) => e.message).join(" · ")}</div> : null}

      {!v ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-users"}`} /><b>{busy ? "Reading age-wise data from Meta..." : "No data yet"}</b><span>Press "Refresh from Meta".</span></div></div>
      ) : (
        <>
          <div className="lf-stats">
            <div><span>Form leads{q ? ` · “${q}”` : ""}</span><b>{num(v.tot.leads)}</b><em>{v.list.length} campaigns · {v.setCount} ad sets</em></div>
            <div><span>Spend</span><b>{inr(v.tot.spend)}</b><em>{v.tot.leads ? `${inr(v.tot.spend / v.tot.leads, 2)} per lead` : "—"} · {num(v.tot.chats)} chats</em></div>
            <div><span>Top age group</span><b className="st-txt">{v.top ? v.top.k : "—"}</b><em>{v.top ? `${num(v.top.leads)} leads · ${pct(v.top.leads, v.tot.leads).toFixed(0)}%` : ""}</em></div>
            <div><span>Cheapest age group</span><b className="st-txt">{v.cheapest ? v.cheapest.k : "—"}</b><em>{v.cheapest ? `${inr(v.cheapest.spend / v.cheapest.leads, 2)} per lead` : "needs 3+ leads"}</em></div>
          </div>

          {/* ---- age groups ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {v.ages.map((x) => (
              <div key={x.k} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, outline: v.top && v.top.k === x.k ? "2px solid #E8A81C" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <b style={{ fontSize: 13 }}><i className="fa-solid fa-user" style={{ color: AGE_COLORS[x.k] || "#64748B", marginRight: 6 }} />{x.k}</b>
                  {v.top && v.top.k === x.k ? <span className="mx-tag">Top</span> : null}
                </div>
                <b style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{num(x.leads)}</b>
                <span style={{ height: 6, borderRadius: 99, background: "#EEF0F5", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${(x.leads / maxA) * 100}%`, background: AGE_COLORS[x.k] || "#64748B", borderRadius: 99 }} /></span>
                <small style={{ fontSize: 11.5, color: "#5B6478" }}>{pct(x.leads, v.tot.leads).toFixed(0)}% · {x.leads ? `${inr(x.spend / x.leads, 2)}/lead` : "—"}</small>
              </div>
            ))}
          </div>

          {/* ---- campaigns × ages ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-users" /></span>
              <div><b>Campaigns &amp; ad sets by age</b><small>{q ? `Matching “${q}”` : camps.length ? `${camps.length} campaigns` : "All campaigns"} · click a campaign to see its ad sets</small></div>
            </div>
            {v.list.length ? (
              <div className="tbl-scroll">
                <table className="mod-table st-t">
                  <thead><tr><th>Campaign / ad set</th>{v.ageKeys.map((k) => <th key={k} className="ta-r">{k}</th>)}<th className="ta-r">Total leads</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th></tr></thead>
                  <tbody>
                    {v.list.map((c) => (
                      <Fragment key={c.id}>
                        <tr onClick={() => setOpenC((o) => ({ ...o, [c.id]: !o[c.id] }))} style={{ cursor: "pointer", background: openC[c.id] ? "#FFFBF0" : undefined }}>
                          <td style={openC[c.id] ? { background: "#FFFBF0" } : undefined}><b><i className={`fa-solid fa-chevron-${openC[c.id] ? "down" : "right"}`} style={{ fontSize: 10, color: "#959CAE", marginRight: 8 }} />{c.name}</b><small className="mut" style={{ display: "block", marginLeft: 18 }}>{c.sets.length} ad set{c.sets.length === 1 ? "" : "s"}</small></td>
                          {v.ageKeys.map((k) => <td key={k} className="ta-r">{cell(c, k)}</td>)}
                          <td className="ta-r"><b>{num(c.leads)}</b></td>
                          <td className="ta-r">{inr(c.spend, 2)}</td>
                          <td className="ta-r">{c.leads ? inr(c.spend / c.leads, 2) : <span className="mut">—</span>}</td>
                        </tr>
                        {openC[c.id] ? c.sets.map((st) => (
                          <tr key={`${c.id}-${st.id}`} style={{ background: "#FAFBFD" }}>
                            <td style={{ paddingLeft: 34, background: "#FAFBFD" }}><i className="fa-solid fa-layer-group" style={{ fontSize: 11, color: "#959CAE", marginRight: 6 }} />{st.name}</td>
                            {v.ageKeys.map((k) => <td key={k} className="ta-r">{cell(st, k)}</td>)}
                            <td className="ta-r"><b>{num(st.leads)}</b></td>
                            <td className="ta-r">{inr(st.spend, 2)}</td>
                            <td className="ta-r">{st.leads ? inr(st.spend / st.leads, 2) : <span className="mut">—</span>}</td>
                          </tr>
                        )) : null}
                      </Fragment>
                    ))}
                    <tr style={{ background: "#F4F5FA" }}>
                      <td style={{ background: "#F4F5FA" }}><b>Total</b></td>
                      {v.ageKeys.map((k) => <td key={k} className="ta-r"><b>{num(v.tot.ages[k]?.leads || 0)}</b></td>)}
                      <td className="ta-r"><b>{num(v.tot.leads)}</b></td>
                      <td className="ta-r"><b>{inr(v.tot.spend, 2)}</b></td>
                      <td className="ta-r"><b>{v.tot.leads ? inr(v.tot.spend / v.tot.leads, 2) : "—"}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="lf-empty"><i className="fa-solid fa-magnifying-glass" /><b>Nothing found</b><span>{q ? `No campaign or ad set has “${q}” in its name in this period.` : "No ads ran in this period."}</span></div>}
          </section>

          <p className="st-note"><i className="fa-solid fa-circle-info" /> Age comes from Meta (the age of the people who filled the form / started the chat). Search looks at campaign and ad set names.</p>
        </>
      )}
    </div>
  );
}

/* "All campaigns" · ek chuna to uska naam · zyada chune to "3 campaigns" */
function pickLabel(value, options, allLabel, noun) {
  if (!value.length) return allLabel;
  if (value.length === 1) return options.find((o) => o.id === value[0])?.label || `1 ${noun}`;
  return `${value.length} ${noun} selected`;
}

/* Checkbox wala dropdown — kuch na chuna = saare */
function MultiPick({ icon, noun, allLabel, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const t = q.trim().toLowerCase();
  const shown = t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
  const set = new Set(value);
  const toggle = (id) => onChange(set.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const label = value.length ? pickLabel(value, options, allLabel, noun) : `${allLabel} (${options.length})`;

  return (
    <div ref={ref} className={`st-sel wide${value.length ? " on" : ""}`} style={{ padding: 0 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, height: "100%", width: "100%", padding: "0 30px 0 12px", border: 0, background: "transparent", cursor: "pointer", font: "600 13px var(--font)", color: "#1B2333", minWidth: 0 }}>
        <i className={`fa-solid ${icon}`} style={{ fontSize: 12, color: "#646B7E" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{label}</span>
        {value.length > 1 ? <em style={{ fontStyle: "normal", fontSize: 11, fontWeight: 800, background: "#E8A81C", color: "#fff", borderRadius: 999, padding: "1px 7px" }}>{value.length}</em> : null}
      </button>
      <i className={`fa-solid fa-chevron-${open ? "up" : "down"} st-cv`} />

      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, width: "min(380px, 92vw)", background: "#fff", border: "1px solid #E3E6EF", borderRadius: 14, boxShadow: "0 18px 40px rgba(18,20,28,.16)", overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid #EEF0F5" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", border: "1px solid #E3E6EF", borderRadius: 10, background: "#F8F9FC" }}>
              <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 11.5, color: "#959CAE" }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${noun}...`}
                style={{ flex: 1, border: 0, outline: "none", background: "transparent", font: "500 13px var(--font)", minWidth: 0 }} />
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 12 }}>
              <span style={{ color: "#5B6478", fontWeight: 600 }}>{value.length ? `${value.length} selected` : `All ${options.length} ${noun}`}</span>
              <span style={{ display: "flex", gap: 12 }}>
                <button type="button" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.id)])])} style={{ border: 0, background: "none", color: "#B7791F", fontWeight: 700, cursor: "pointer", padding: 0 }}>Select all</button>
                <button type="button" onClick={() => onChange([])} disabled={!value.length} style={{ border: 0, background: "none", color: value.length ? "#B42318" : "#C3C8D4", fontWeight: 700, cursor: value.length ? "pointer" : "default", padding: 0 }}>Clear</button>
              </span>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: 6 }}>
            {shown.length ? shown.map((o) => {
              const on = set.has(o.id);
              return (
                <label key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 9px", borderRadius: 9, cursor: "pointer", background: on ? "#FFF8E6" : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(o.id)} style={{ marginTop: 2, accentColor: "#E8A81C", width: 15, height: 15, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: "#1B2333", wordBreak: "break-word" }}>{o.label}</span>
                </label>
              );
            }) : <div style={{ padding: 16, textAlign: "center", fontSize: 12.5, color: "#7A8295" }}>Nothing found</div>}
          </div>
          <div style={{ padding: 8, borderTop: "1px solid #EEF0F5", display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-gold" style={{ height: 32, padding: "0 14px", fontSize: 12.5 }} onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


/* ============================================================
   LEAD REPORT (sidebar → "Lead Report", page app/lead-report)

   CRM ki leads — jis date range me lead BANI, wo sab, aur har lead
   ABHI kis stage pe hai. Isi se "pichhle mahine 5k leads aayi, ab kaun
   kis stage pe hai" dikhta hai.
     · Upar har stage ka box (gintī + %) — box dabao to usi stage ki leads
     · Filter: stage · naam/phone · service keyword (jaise "TM") ·
       service · staff · source · campaign · pipeline
     · "Breakdown" table: mahina / hafta / din / service / staff / source /
       campaign  ×  stages
     · Leads ki list + CSV export (jo filter laga hai wahi leads)
   Data CRM ke MySQL se (sirf padhte hain, kuch badalte nahi).
   ============================================================ */
const LR_PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "90", label: "Last 90 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom dates" },
];
const LR_GROUPS = [
  { key: "month", label: "Month" }, { key: "week", label: "Week" }, { key: "day", label: "Day" },
  { key: "service", label: "Service" }, { key: "staff", label: "Staff" }, { key: "source", label: "Source" },
  { key: "campaign", label: "Campaign" }, { key: "pipeline", label: "Pipeline" },
];
/* Chhote naam → service me kya likha hota hai (keyword search ke liye) */
const LR_ALIAS = {
  tm: ["trademark", "trade mark"], gst: ["goods and service"], itr: ["income tax return", "income tax"],
  pvt: ["private limited", "pvt ltd"], llp: ["limited liability"], opc: ["one person"],
  fssai: ["food licen"], msme: ["udyam", "udyog"], iec: ["import export"], dsc: ["digital signature"],
  ngo: ["trust", "society", "section 8"], roc: ["annual filing", "annual compliance"],
  pf: ["provident fund", "epf"], esi: ["esic"], copyright: ["copy right"],
};
const LR_PER = 25;
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lrRange(key, cf, ct) {
  const now = new Date();
  const from = new Date(now); const to = new Date(now);
  if (key === "custom") return { from: cf || iso(now), to: ct || iso(now) };
  if (key === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
  else if (key === "month") from.setDate(1);
  else if (key === "lastmonth") { from.setDate(1); from.setMonth(from.getMonth() - 1); to.setDate(0); }
  else if (key === "year") { from.setMonth(0, 1); }
  else if (key !== "today") from.setDate(from.getDate() - (Number(key) - 1));
  return { from: iso(from), to: iso(to) };
}
const lrDate = (s) => {
  const [d, t] = String(s || "").split(" ");
  const [y, m, dd] = (d || "").split("-").map(Number);
  if (!m) return "";
  const [hh, mm] = (t || "0:0").split(":").map(Number);
  return `${dd} ${MONS[m - 1]} ${y}, ${((hh + 11) % 12) + 1}:${z(mm || 0)} ${hh < 12 ? "AM" : "PM"}`;
};
const lrShort = (isoDay) => { const [y, m, d] = String(isoDay).split("-").map(Number); return m ? `${d} ${MONS[m - 1]} ${y}` : ""; };
function lrStageTone(label) {
  const s = String(label || "").toLowerCase();
  if (/store room|storeroom|remarketing/.test(s)) return { c: "#B7791F", bg: "#FFF6E0" };
  if (/won|converted|closed won|paid/.test(s)) return { c: "#1E8A54", bg: "#E8F6EE" };
  if (/lost|not interested|junk|reject|invalid|wrong|dead|spam/.test(s)) return { c: "#C0392B", bg: "#FDECEC" };
  if (/not answer|no answer|unanswer|not reach|switch|rnr|busy/.test(s)) return { c: "#E2621B", bg: "#FFF1E8" };
  if (/proposal|quot|negotiat|payment|invoice/.test(s)) return { c: "#7C3AED", bg: "#F2ECFE" };
  if (/follow|call back|callback|interested|hot|warm|meeting|contacted/.test(s)) return { c: "#B7791F", bg: "#FFF6E0" };
  if (/new|fresh|open|unassigned/.test(s)) return { c: "#2a78d6", bg: "#EAF2FD" };
  return { c: "#475569", bg: "#F1F3F8" };
}
/* "TM" → service/campaign me "TM" shabd ya "Trademark" ho */
function lrKeyword(text, kw) {
  const terms = String(kw || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  if (!terms.length) return true;
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return terms.some((term) => {
    const clean = term.replace(/[^a-z0-9]+/g, " ").trim();
    if (!clean) return false;
    const hit = clean.length <= 3 ? t.includes(` ${clean} `) : t.includes(clean);
    return hit || (LR_ALIAS[clean] || []).some((a) => t.includes(a));
  });
}
function lrWeek(day) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
function lrCsv(name, head, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function LeadReport() {
  const [period, setPeriod] = useState("month");
  const [cf, setCf] = useState("");
  const [ct, setCt] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [setup, setSetup] = useState(false);
  /* filters */
  const [q, setQ] = useState("");
  const [kw, setKw] = useState("");
  const [stages, setStages] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [sources, setSources] = useState([]);
  const [camps, setCamps] = useState([]);
  const [pipe, setPipe] = useState("");
  const [where, setWhere] = useState("all");      /* all · pipeline · store (store room) */
  const [view, setView] = useState("created");    /* created · reeng (dobara aayi leads) */
  const [group, setGroup] = useState("month");
  const [asPct, setAsPct] = useState(false);
  const [page, setPage] = useState(1);

  const R = lrRange(period, cf, ct);

  async function load() {
    if (R.from > R.to) { setErr("From date is after To date."); return; }
    setBusy(true); setErr(""); setSetup(false);
    try {
      const r = await fetch("/api/crm/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: true, from: R.from, to: R.to }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Could not load leads from CRM"); setSetup(Boolean(j.needsSetup)); return; }
      const D = j.dict || {};
      const at = (k, i) => (i >= 0 ? D[k]?.[i] || "" : "");
      const dec = (a) => ({
        id: a[0], created: a[1], day: String(a[1]).slice(0, 10), name: a[2], phone: a[3], email: a[4],
        stage: at("stage", a[5]) || "No stage", staff: at("staff", a[6]) || "Unassigned", service: at("service", a[7]),
        source: at("source", a[8]), campaign: at("campaign", a[9]), pipeline: at("pipeline", a[10]),
        deal: Number(a[11]) || 0, updated: a[12], city: a[13], state: at("state", a[14]),
        store: a[15] === 1, reengTotal: Number(a[16]) || 0,
      });
      const rows = (j.rows || []).map(dec);
      const extra = (j.extraRows || []).map(dec);
      /* Re-engaged: har lead ke liye in dates me kitni baar wapas aayi + aakhri baar kab */
      const re = new Map();
      (j.reeng || []).forEach(([id, when, src, on, svc]) => {
        const k = String(id);
        const o = re.get(k) || { times: 0, at: "", src: "", on: "", svc: "" };
        o.times += 1;
        if (!o.at || when > o.at) Object.assign(o, { at: when, src, on, svc });
        re.set(k, o);
      });
      const withRe = (r) => { const o = re.get(String(r.id)); return o ? { ...r, reengIn: o.times, reengAt: o.at, reengSrc: o.src, reengSvc: o.svc } : { ...r, reengIn: 0, reengAt: "" }; };
      setData({ ...j, rows: rows.map(withRe), extra: extra.map(withRe), reengEvents: (j.reeng || []).length });
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (period !== "custom") load(); }, [period]);
  useEffect(() => { setPage(1); }, [q, kw, stages, services, staff, sources, camps, pipe, where, view, data]);

  const v = useMemo(() => {
    if (!data) return null;
    /* "Re-engaged" view: in dates me jo leads dobara aayi (chahe pehle kabhi bani hon).
       Unka din = jis din wapas aayi. */
    const reengList = [...data.rows, ...(data.extra || [])].filter((r) => r.reengIn > 0)
      .map((r) => ({ ...r, day: String(r.reengAt).slice(0, 10) }))
      .sort((a, b) => String(b.reengAt).localeCompare(String(a.reengAt)));
    const all = view === "reeng" ? reengList : data.rows;
    const lostSet = new Set((data.lostValues || []).map((x) => String(x).toLowerCase()));
    const isWon = (s) => /\bwon\b|converted/i.test(s);
    const isLost = (s) => lostSet.has(String(s).toLowerCase()) || /lost|not interested|junk|reject/i.test(s);
    const uniq = (k) => { const m = new Map(); all.forEach((r) => { const x = r[k]; if (x) m.set(x, (m.get(x) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const t = q.trim().toLowerCase();
    const tDigits = t.replace(/\D/g, "");
    const pre = all.filter((r) => {
      if (pipe && r.pipeline !== pipe) return false;
      if (services.length && !services.includes(r.service)) return false;
      if (staff.length && !staff.includes(r.staff)) return false;
      if (sources.length && !sources.includes(r.source)) return false;
      if (camps.length && !camps.includes(r.campaign)) return false;
      if (kw.trim() && !lrKeyword(`${r.service} ${r.campaign}`, kw)) return false;
      if (t) {
        const hay = `${r.name} ${r.email} ${r.id} ${r.city} ${r.state}`.toLowerCase();
        const ph = String(r.phone || "").replace(/\D/g, "");
        if (!hay.includes(t) && !(tDigits.length >= 3 && ph.includes(tDigits))) return false;
      }
      return true;
    });
    /* Store room / pipeline — baaki filter ke baad ginti (box me dikhane ke liye) */
    const storeN = pre.filter((r) => r.store).length;
    const reengN = pre.filter((r) => r.reengIn > 0).length;
    const reengTimes = pre.reduce((n, r) => n + (r.reengIn || 0), 0);
    const base = where === "store" ? pre.filter((r) => r.store) : where === "pipeline" ? pre.filter((r) => !r.store) : pre;
    /* Stage boxes — stage filter ke bina (taaki baaki stages ki ginti bhi dikhe) */
    const cnt = new Map(); const val = new Map();
    base.forEach((r) => { cnt.set(r.stage, (cnt.get(r.stage) || 0) + 1); val.set(r.stage, (val.get(r.stage) || 0) + r.deal); });
    const order = [];
    const seen = new Set();
    (data.stages || []).filter((s) => !pipe || s.pipeline === pipe).forEach((s) => { if (!seen.has(s.label)) { seen.add(s.label); order.push(s.label); } });
    [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a)).forEach((k) => { if (!seen.has(k)) { seen.add(k); order.push(k); } });
    const stageCards = order.map((k) => ({ k, n: cnt.get(k) || 0, val: val.get(k) || 0, tone: lrStageTone(k) }))
      .filter((x) => x.n > 0 || (data.stages || []).some((s) => s.label === x.k));
    const list = stages.length ? base.filter((r) => stages.includes(r.stage)) : base;
    const won = list.filter((r) => isWon(r.stage));
    const lost = list.filter((r) => isLost(r.stage));
    const wonVal = won.reduce((a, r) => a + r.deal, 0);
    const storeList = list.filter((r) => r.store && !isWon(r.stage) && !isLost(r.stage));

    /* Breakdown: rows = group, columns = stages */
    const keyOf = (r) => {
      if (group === "month") return r.day.slice(0, 7);
      if (group === "week") return lrWeek(r.day);
      if (group === "day") return r.day;
      return r[group] || (group === "staff" ? "Unassigned" : "—");
    };
    const gm = new Map();
    list.forEach((r) => {
      const k = keyOf(r);
      const g = gm.get(k) || { k, total: 0, by: {} };
      g.total += 1; g.by[r.stage] = (g.by[r.stage] || 0) + 1;
      gm.set(k, g);
    });
    const timeGroup = ["month", "week", "day"].includes(group);
    const groups = [...gm.values()].sort((a, b) => (timeGroup ? String(b.k).localeCompare(String(a.k)) : b.total - a.total));
    const cols = stageCards.filter((x) => list.some((r) => r.stage === x.k)).map((x) => x.k);
    const totBy = {}; list.forEach((r) => { totBy[r.stage] = (totBy[r.stage] || 0) + 1; });
    const label = (k) => {
      if (group === "month") { const [y, m] = String(k).split("-").map(Number); return `${MONS[m - 1]} ${y}`; }
      if (group === "week") return `Week of ${lrShort(k)}`;
      if (group === "day") return lrShort(k);
      return k;
    };
    return {
      all, pre, base, list, stageCards, won, lost, wonVal, storeList, storeN, reengN, reengTimes, reengAll: reengList.length, groups, cols, totBy, label,
      opts: { service: uniq("service"), staff: uniq("staff"), source: uniq("source"), campaign: uniq("campaign"), pipeline: uniq("pipeline") },
    };
  }, [data, q, kw, stages, services, staff, sources, camps, pipe, group, where, view]);

  const toggleStage = (k) => setStages((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const anyFilter = q || kw || stages.length || services.length || staff.length || sources.length || camps.length || pipe || where !== "all";
  const clearAll = () => { setQ(""); setKw(""); setStages([]); setServices([]); setStaff([]); setSources([]); setCamps([]); setPipe(""); setWhere("all"); };
  const opt = (arr) => arr.map(([k, n]) => ({ id: k, label: `${k} (${num(n)})` }));
  const pages = v ? Math.max(1, Math.ceil(v.list.length / LR_PER)) : 1;
  const cur = Math.min(page, pages);
  const shown = v ? v.list.slice((cur - 1) * LR_PER, cur * LR_PER) : [];
  const tag = `${R.from}-to-${R.to}`;

  function exportLeads() {
    lrCsv(`vakilkaro-${view === "reeng" ? "reengaged-leads" : "lead-report"}-${tag}.csv`,
      ["Lead ID", "Created", "Name", "Phone", "Email", "Service", "Stage", "Store room", "Pipeline", "Staff", "Source", "Campaign", "Deal value", "City", "State", "Last updated", "Re-engaged in these dates", "Last re-engaged", "Re-engaged (all time)"],
      v.list.map((r) => [r.id, r.created, r.name, r.phone, r.email, r.service, r.stage, r.store ? "Yes" : "", r.pipeline, r.staff, r.source, r.campaign, r.deal || "", r.city, r.state, r.updated, r.reengIn || "", r.reengAt || "", r.reengTotal || ""]));
  }
  function exportBreakdown() {
    const g = LR_GROUPS.find((x) => x.key === group)?.label || "Group";
    lrCsv(`vakilkaro-lead-stages-by-${group}-${tag}.csv`, [g, "Total", ...v.cols],
      [...v.groups.map((x) => [v.label(x.k), x.total, ...v.cols.map((c) => x.by[c] || 0)]), ["Total", v.list.length, ...v.cols.map((c) => v.totBy[c] || 0)]]);
  }
  const cellTxt = (n, total) => (!n ? <span className="mut">–</span> : asPct ? `${pct(n, total).toFixed(0)}%` : num(n));
  const inputStyle = { flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "600 13px var(--font)", color: "#1B2333" };
  const xBtn = (fn, lbl) => <button type="button" onClick={fn} aria-label={lbl} style={{ border: 0, background: "none", cursor: "pointer", color: "#959CAE", padding: 0 }}><i className="fa-solid fa-xmark" /></button>;

  return (
    <div className="st">
      <div className="lf-head">
        <div className="pg-desc" style={{ marginTop: 0 }}>Every lead created in the CRM in the chosen dates (store room leads included), and the stage it is in right now. Switch to “Re-engaged” to see old leads that came back in these dates. Search a service keyword like “TM” to see all related leads.</div>
        <div className="lf-acts">
          {data?.at ? <span className="lf-at"><i className="fa-solid fa-rotate" /> Loaded {new Date(data.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          <button type="button" className="btn btn-gold" disabled={busy} onClick={load}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {busy ? "Loading from CRM..." : "Refresh from CRM"}
          </button>
        </div>
      </div>

      <div className="st-filters">
        <label className="st-sel"><i className="fa-regular fa-calendar" />
          <select value={period} onChange={(e) => { const k = e.target.value; if (k === "custom" && !cf) { const r0 = lrRange("month"); setCf(r0.from); setCt(r0.to); } setPeriod(k); }} aria-label="Lead created in">
            {LR_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.key === "custom" ? p.label : `Created: ${p.label}`}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        {period === "custom" ? (
          <>
            <label className="st-sel" style={{ paddingRight: 12 }}><span style={{ fontSize: 12, color: "#646B7E", fontWeight: 600 }}>From</span>
              <input type="date" value={cf} max={ct || undefined} onChange={(e) => setCf(e.target.value)} aria-label="From date" style={inputStyle} /></label>
            <label className="st-sel" style={{ paddingRight: 12 }}><span style={{ fontSize: 12, color: "#646B7E", fontWeight: 600 }}>To</span>
              <input type="date" value={ct} min={cf || undefined} onChange={(e) => setCt(e.target.value)} aria-label="To date" style={inputStyle} /></label>
            <button type="button" className="btn btn-gold" disabled={busy || !cf || !ct} onClick={load}><i className="fa-solid fa-check" /> Apply</button>
          </>
        ) : <span className="lf-at">{lrShort(R.from)}{R.from !== R.to ? ` – ${lrShort(R.to)}` : ""}</span>}
      </div>

      {data ? (
        <div className="st-filters">
          <label className={`st-sel wide${q ? " on" : ""}`} style={{ paddingRight: 10 }}>
            <i className="fa-solid fa-magnifying-glass" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email or lead ID" aria-label="Search leads" style={inputStyle} />
            {q ? xBtn(() => setQ(""), "Clear search") : null}
          </label>
          <label className={`st-sel wide${kw ? " on" : ""}`} style={{ paddingRight: 10 }}>
            <i className="fa-solid fa-briefcase" />
            <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Service keyword — e.g. TM, GST, NGO" aria-label="Service keyword" style={inputStyle} />
            {kw ? xBtn(() => setKw(""), "Clear keyword") : null}
          </label>
          <MultiPick icon="fa-flag" noun="stages" allLabel="All stages" options={(v?.stageCards || []).map((x) => ({ id: x.k, label: `${x.k} (${num(x.n)})` }))} value={stages} onChange={setStages} />
          <MultiPick icon="fa-scale-balanced" noun="services" allLabel="All services" options={opt(v?.opts.service || [])} value={services} onChange={setServices} />
          <MultiPick icon="fa-user-tie" noun="staff" allLabel="All staff" options={opt(v?.opts.staff || [])} value={staff} onChange={setStaff} />
          <MultiPick icon="fa-signal" noun="sources" allLabel="All sources" options={opt(v?.opts.source || [])} value={sources} onChange={setSources} />
          <MultiPick icon="fa-bullhorn" noun="campaigns" allLabel="All campaigns" options={opt(v?.opts.campaign || [])} value={camps} onChange={setCamps} />
          {(v?.opts.pipeline || []).length > 1 ? (
            <label className={`st-sel${pipe ? " on" : ""}`}><i className="fa-solid fa-diagram-project" />
              <select value={pipe} onChange={(e) => { setPipe(e.target.value); setStages([]); }} aria-label="Pipeline">
                <option value="">All pipelines</option>
                {v.opts.pipeline.map(([k, n]) => <option key={k} value={k}>{k} ({num(n)})</option>)}
              </select><i className="fa-solid fa-chevron-down st-cv" />
            </label>
          ) : null}
          <label className={`st-sel${where !== "all" ? " on" : ""}`}><i className="fa-solid fa-box-archive" />
            <select value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Pipeline or store room">
              <option value="all">Pipeline + store room</option>
              <option value="pipeline">Only in pipeline</option>
              <option value="store">Only in store room</option>
            </select><i className="fa-solid fa-chevron-down st-cv" />
          </label>
          {anyFilter ? <button type="button" className="ph-clear" onClick={clearAll}>Clear all</button> : null}
        </div>
      ) : null}

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}{setup ? " Add the CRM_DB_* values in your environment settings, then try again." : ""}</div> : null}
      {data?.truncated ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> This range has {num(data.total)} leads — showing the newest {num(data.rows.length)}. Pick a shorter date range to see all of them.</div> : null}

      {!v ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-chart-column"}`} /><b>{busy ? "Reading leads from the CRM..." : "No data yet"}</b><span>{busy ? "This can take a few seconds for a big date range." : "Pick the dates and press “Refresh from CRM”."}</span></div></div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {[
              { k: "created", on: view === "created", icon: "fa-inbox", c: "#2a78d6", bg: "#EAF2FD", title: "Created in these dates", n: data.rows.length, sub: "New leads that came into the CRM", click: () => setView("created") },
              { k: "reeng", on: view === "reeng", icon: "fa-rotate-left", c: "#D33F49", bg: "#FDECEE", title: "Re-engaged in these dates", n: v.reengAll, sub: data.reengOk === false ? "Re-engaged data not found in the CRM" : `${num(data.reengEvents || 0)} repeat enquiries · old leads that came back`, click: () => setView("reeng") },
              { k: "store", on: where === "store", icon: "fa-box-archive", c: "#B7791F", bg: "#FFF6E0", title: "In store room", n: v.storeN, sub: `${pct(v.storeN, v.pre.length).toFixed(1)}% of these leads${data.storeTotal != null ? ` · ${num(data.storeTotal)} in store room right now (all dates)` : ""}`, click: () => setWhere(where === "store" ? "all" : "store") },
            ].map((b) => (
              <button type="button" key={b.k} onClick={b.click} aria-pressed={b.on} className="card"
                style={{ textAlign: "left", cursor: "pointer", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, border: b.on ? `2px solid ${b.c}` : "1px solid var(--pm-line,#E3E6EF)", background: b.on ? b.bg : "#fff", font: "inherit", color: "inherit" }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: b.bg, color: b.c, flex: "0 0 auto" }}><i className={`fa-solid ${b.icon}`} /></span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1B2333" }}>{b.title}</span>
                  <b style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1 }}>{num(b.n)}</b>
                  <small style={{ fontSize: 11.5, color: "#5B6478" }}>{b.sub}</small>
                </span>
                {b.on ? <i className="fa-solid fa-check" style={{ marginLeft: "auto", color: b.c }} /> : null}
              </button>
            ))}
          </div>

          <div className="lf-stats">
            <div><span>{view === "reeng" ? "Re-engaged leads" : "Leads"}{anyFilter ? " (filtered)" : ""}</span><b>{num(v.list.length)}</b><em>{anyFilter ? `of ${num(v.all.length)} ${view === "reeng" ? "re-engaged" : "created"} in these dates` : `${view === "reeng" ? "came back" : "created"} ${lrShort(R.from)}${R.from !== R.to ? ` – ${lrShort(R.to)}` : ""}`}{view === "created" && v.reengN ? ` · ${num(v.reengN)} came back again` : ""}</em></div>
            <div><span>Won</span><b style={{ color: "#1E8A54" }}>{num(v.won.length)}</b><em>{pct(v.won.length, v.list.length).toFixed(1)}% conversion{v.wonVal ? ` · ${inr(v.wonVal)}` : ""}</em></div>
            <div><span>Lost / not interested</span><b style={{ color: "#C0392B" }}>{num(v.lost.length)}</b><em>{pct(v.lost.length, v.list.length).toFixed(1)}% of these leads</em></div>
            <div><span>Still open</span><b>{num(v.list.length - v.won.length - v.lost.length)}</b><em>{pct(v.list.length - v.won.length - v.lost.length, v.list.length).toFixed(1)}%{v.storeList.length ? ` · ${num(v.storeList.length)} in store room` : " — being worked on"}</em></div>
          </div>

          {/* ---- stage boxes ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {v.stageCards.map((x) => {
              const on = stages.includes(x.k);
              return (
                <button type="button" key={x.k} onClick={() => toggleStage(x.k)} aria-pressed={on} className="card"
                  style={{ textAlign: "left", cursor: "pointer", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 5, border: on ? `2px solid ${x.tone.c}` : "1px solid var(--pm-line,#E3E6EF)", background: on ? x.tone.bg : "#fff", opacity: stages.length && !on ? 0.6 : 1, font: "inherit", color: "inherit" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "#1B2333", minWidth: 0 }}>
                    <i style={{ width: 9, height: 9, borderRadius: 99, background: x.tone.c, flex: "0 0 auto" }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.k}>{x.k}</span>
                    {on ? <i className="fa-solid fa-check" style={{ marginLeft: "auto", color: x.tone.c, fontSize: 11 }} /> : null}
                  </span>
                  <b style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{num(x.n)}</b>
                  <span style={{ height: 5, borderRadius: 99, background: "#EEF0F5", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${pct(x.n, v.base.length)}%`, background: x.tone.c, borderRadius: 99 }} /></span>
                  <small style={{ fontSize: 11.5, color: "#5B6478" }}>{pct(x.n, v.base.length).toFixed(1)}%{x.val ? ` · ${inr(x.val)}` : ""}</small>
                </button>
              );
            })}
          </div>

          {/* ---- breakdown ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-table-cells" /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>Where these leads are now</b><small>Leads {view === "reeng" ? "that came back" : "created"} in each {LR_GROUPS.find((x) => x.key === group)?.label.toLowerCase()} and the stage they are in today</small></div>
              <label className="st-sel"><i className="fa-solid fa-layer-group" />
                <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Break down by">
                  {LR_GROUPS.map((g) => <option key={g.key} value={g.key}>By {g.label.toLowerCase()}</option>)}
                </select><i className="fa-solid fa-chevron-down st-cv" />
              </label>
              <label className="st-check"><input type="checkbox" checked={asPct} onChange={(e) => setAsPct(e.target.checked)} /> Show %</label>
              <button type="button" className="btn btn-ghost" onClick={exportBreakdown} disabled={!v.list.length}><i className="fa-solid fa-file-csv" /> CSV</button>
            </div>
            {v.list.length ? (
              <div className="tbl-scroll" style={{ maxHeight: 460 }}>
                <table className="mod-table st-t">
                  <thead><tr><th>{LR_GROUPS.find((x) => x.key === group)?.label}</th><th className="ta-r">Total</th>{v.cols.map((c) => <th key={c} className="ta-r" style={{ color: lrStageTone(c).c }}>{c}</th>)}</tr></thead>
                  <tbody>
                    {v.groups.map((g) => (
                      <tr key={g.k}>
                        <td><b style={{ display: "inline-block", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }} title={v.label(g.k)}>{v.label(g.k)}</b></td>
                        <td className="ta-r"><b>{num(g.total)}</b></td>
                        {v.cols.map((c) => <td key={c} className="ta-r">{cellTxt(g.by[c], g.total)}</td>)}
                      </tr>
                    ))}
                    <tr style={{ background: "#F4F5FA" }}>
                      <td style={{ background: "#F4F5FA" }}><b>Total</b></td>
                      <td className="ta-r" style={{ background: "#F4F5FA" }}><b>{num(v.list.length)}</b></td>
                      {v.cols.map((c) => <td key={c} className="ta-r" style={{ background: "#F4F5FA" }}><b>{cellTxt(v.totBy[c], v.list.length)}</b></td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="lf-empty"><i className="fa-solid fa-magnifying-glass" /><b>No leads match</b><span>Change or clear the filters.</span></div>}
          </section>

          {/* ---- leads ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-list" /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>{view === "reeng" ? "Re-engaged leads" : "Leads"}</b><small>{num(v.list.length)} lead{v.list.length === 1 ? "" : "s"}{where === "store" ? " · store room" : where === "pipeline" ? " · in pipeline" : ""}{stages.length ? ` · ${stages.join(", ")}` : ""}{kw ? ` · “${kw}”` : ""} · newest first</small></div>
              <button type="button" className="btn btn-gold" onClick={exportLeads} disabled={!v.list.length}><i className="fa-solid fa-file-arrow-down" /> Export {num(v.list.length)} leads</button>
            </div>
            {v.list.length ? (
              <>
                <div className="tbl-scroll">
                  <table className="mod-table st-t">
                    <thead><tr><th>Lead</th><th>{view === "reeng" ? "Came back" : "Created"}</th><th>Phone</th><th>Service</th><th>Stage</th><th>Staff</th><th>Source / campaign</th><th className="ta-r">Deal</th></tr></thead>
                    <tbody>
                      {shown.map((r) => {
                        const tone = lrStageTone(r.stage);
                        return (
                          <tr key={r.id}>
                            <td><b>{r.name || "—"}</b><small className="mut" style={{ display: "block" }}>#{r.id}{r.city || r.state ? ` · ${[r.city, r.state].filter(Boolean).join(", ")}` : ""}</small></td>
                            <td>{view === "reeng" ? <>{lrDate(r.reengAt)}<small className="mut" style={{ display: "block" }}>Created {lrDate(r.created)}</small></> : lrDate(r.created)}</td>
                            <td>{r.phone || <span className="mut">—</span>}{r.email ? <small className="mut" style={{ display: "block" }}>{r.email}</small> : null}</td>
                            <td style={{ whiteSpace: "normal", minWidth: 160 }}>{r.service || <span className="mut">—</span>}</td>
                            <td><span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, color: tone.c, background: tone.bg, borderRadius: 7, padding: "2px 8px" }}>{r.stage}</span>
                              {r.store ? <span style={{ display: "inline-block", marginLeft: 4, fontSize: 11, fontWeight: 700, color: "#B7791F", background: "#FFF6E0", borderRadius: 7, padding: "2px 7px" }}><i className="fa-solid fa-box-archive" /> Store room</span> : null}
                              {r.reengIn ? <span title={`${r.reengIn} time(s) in these dates${r.reengSvc ? ` · asked about ${r.reengSvc}` : ""}`} style={{ display: "inline-block", marginLeft: 4, fontSize: 11, fontWeight: 700, color: "#D33F49", background: "#FDECEE", borderRadius: 7, padding: "2px 7px" }}><i className="fa-solid fa-rotate-left" /> Re-engaged{r.reengIn > 1 ? ` ×${r.reengIn}` : ""}</span> : null}
                              {r.pipeline ? <small className="mut" style={{ display: "block" }}>{r.pipeline}</small> : null}</td>
                            <td>{r.staff}</td>
                            <td style={{ whiteSpace: "normal", minWidth: 160 }}>{r.source || <span className="mut">—</span>}{r.campaign ? <small className="mut" style={{ display: "block" }}>{r.campaign}</small> : null}</td>
                            <td className="ta-r">{r.deal ? inr(r.deal) : <span className="mut">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "0 18px 14px" }}><TablePager page={cur} pages={pages} total={v.list.length} onPage={setPage} perPage={LR_PER} /></div>
              </>
            ) : <div className="lf-empty"><i className="fa-solid fa-magnifying-glass" /><b>No leads match</b><span>Change or clear the filters.</span></div>}
          </section>

          <p className="st-note"><i className="fa-solid fa-circle-info" /> Dates are when the lead was created in the CRM; the stage is where it is right now. Service keyword looks at the service and campaign — “TM” also finds “Trademark”. Separate keywords with a comma to find more than one (e.g. TM, GST).</p>
        </>
      )}
    </div>
  );
}

/* ============================================================
   BY LEAD QUANTITY (Campaigns → "By Lead Quantity")

   Kisi bhi keyword (jaise "TM") ki leads din-ba-din — Meta ke ad set
   ke din-wise data se. Comma se kai keyword do (TM, GST, NGO) to graph
   me har keyword ki alag line — seedha tulna.
     · Filter: Today / Yesterday / Last 7 days / This month / Last month /
       Last 30 / Last 90 / Custom · campaigns (kai ek saath) · sirf chal rahe
     · Graph: leads / chats / leads + chats / kharch / cost per lead
     · Keyword-wise tally · campaign + ad set table · din-wise table + CSV
   ============================================================ */
const DCACHE = "vk_meta_daily";
const LQ_PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "custom", label: "Custom dates" },
];
const LQ_METRICS = [
  { key: "leads", label: "Form leads" },
  { key: "chats", label: "Chats" },
  { key: "both", label: "Leads + chats" },
  { key: "spend", label: "Spend" },
  { key: "cpl", label: "Cost per lead" },
];
const LQ_COLORS = ["#2a78d6", "#E2621B", "#1E8A54", "#7C3AED", "#C0392B", "#B7791F", "#0E7490", "#BE185D"];
const LQ_MAXDAYS = 93;

function lqDays(since, until) {
  const out = [];
  const d = new Date(`${since}T00:00:00`);
  const end = new Date(`${until}T00:00:00`);
  for (let g = 0; d <= end && g < 400; g += 1) { out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}
const lqVal = (o, m) => (m === "leads" ? o.leads : m === "chats" ? o.chats : m === "both" ? o.leads + o.chats : m === "spend" ? o.spend : (o.leads ? o.spend / o.leads : 0));
const lqFmt = (v, m) => (m === "spend" || m === "cpl" ? inr(v, m === "cpl" ? 2 : 0) : num(v));
function lqNice(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* Graph — ek series ho to bars, kai ho to lines. Hover pe us din ki detail. */
function LqChart({ days, series, metric }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  const [hi, setHi] = useState(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 260; const padL = 52; const padR = 14; const padT = 14; const padB = 34;
  const iw = Math.max(10, w - padL - padR); const ih = H - padT - padB;
  /* Ginti (leads/chats) ke liye kam se kam 5 — warna 0.4, 0.8 jaise ajeeb nishaan */
  const max = lqNice(Math.max(metric === "spend" || metric === "cpl" ? 0 : 5, ...series.flatMap((s) => s.vals)));
  const n = days.length;
  const step = iw / Math.max(1, n);
  const x = (i) => padL + step * i + step / 2;
  const y = (v) => padT + ih - (v / max) * ih;
  const bars = series.length === 1;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 62))));
  const lbl = (d) => { const [, m, dd] = d.split("-").map(Number); return `${dd} ${MONS[m - 1]}`; };
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - padL) / step);
    setHi(i >= 0 && i < n ? i : null);
  };
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg width={w} height={H} role="img" aria-label="Leads by day chart" style={{ display: "block" }}>
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(max * t)} y2={y(max * t)} stroke="#EEF0F5" />
            <text x={padL - 8} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="#8A91A3">{lqFmt(max * t, metric === "cpl" ? "spend" : metric)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % every === 0 ? <text key={d} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="#8A91A3">{lbl(d)}</text> : null))}
        {hi != null ? <rect x={padL + step * hi} y={padT} width={step} height={ih} fill="#F4F5FA" /> : null}
        {bars ? series[0].vals.map((v, i) => {
          const bw = Math.max(2, Math.min(34, step * 0.62));
          return <rect key={days[i]} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, padT + ih - y(v))} rx={Math.min(4, bw / 3)} fill={series[0].color} opacity={hi == null || hi === i ? 1 : 0.55} />;
        }) : series.map((s) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={s.vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {n <= 45 ? s.vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={hi === i ? 4.5 : 2.6} fill="#fff" stroke={s.color} strokeWidth="2" />) : null}
          </g>
        ))}
      </svg>
      {hi != null ? (
        <div style={{ position: "absolute", top: 8, left: Math.min(Math.max(x(hi) + 12, 0), w - 200), width: 188, background: "#1B2333", color: "#fff", borderRadius: 10, padding: "8px 10px", fontSize: 12, pointerEvents: "none", boxShadow: "0 8px 24px rgba(15,23,42,.25)" }}>
          <b style={{ display: "block", marginBottom: 4 }}>{lrShort(days[hi])}</b>
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.6 }}>
              <i style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flex: "0 0 auto" }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <b>{lqFmt(s.vals[hi], metric)}</b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ByLeadsTab({ tab }) {
  const [period, setPeriod] = useState("7");
  const [cf, setCf] = useState("");
  const [ct, setCt] = useState("");
  const [applied, setApplied] = useState(null);   /* custom dates — "Apply" dabane pe */
  const [camps, setCamps] = useState([]);
  const [running, setRunning] = useState(true);
  const [q, setQ] = useState("");
  const [metric, setMetric] = useState("leads");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openC, setOpenC] = useState({});
  const [local, setLocal] = useState({ camps: [], accounts: [] });

  useEffect(() => {
    const load = () => setLocal({ camps: readRows("campaigns__live-ads"), accounts: readRows("ad-accounts__accounts") });
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  const R = useMemo(() => {
    if (period === "custom") return applied || null;
    const r = lrRange(period === "month" ? "month" : period === "lastmonth" ? "lastmonth" : period);
    return { since: r.from, until: r.to };
  }, [period, applied]);

  async function fetchData(force = false) {
    if (!R) return;
    const key = `${R.since}_${R.until}`;
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(DCACHE) || "{}"); } catch { cache = {}; }
    const hit = cache[key];
    if (!force && hit && Date.now() - Date.parse(hit.at || 0) < 30 * 60000) { setData(hit); return; }
    const ids = [...new Set(local.accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/hour-of-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, ...R, by: "daily" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Could not load day-wise data from Meta");
      else {
        setData(j);
        /* Sirf aakhri 4 range yaad rakho — browser ki jagah na bhare */
        const keep = Object.entries({ ...cache, [key]: j }).sort((a, b) => Date.parse(b[1].at || 0) - Date.parse(a[1].at || 0)).slice(0, 4);
        try { localStorage.setItem(DCACHE, JSON.stringify(Object.fromEntries(keep))); } catch { /* */ }
      }
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (local.accounts.length && R) fetchData(); }, [R?.since, R?.until, local.accounts.length]);

  function applyCustom() {
    if (!cf || !ct) return;
    if (cf > ct) { setErr("From date is after To date."); return; }
    if (lqDays(cf, ct).length > LQ_MAXDAYS) { setErr(`Pick up to ${LQ_MAXDAYS} days at a time.`); return; }
    setErr(""); setApplied({ since: cf, until: ct });
  }

  const activeIds = useMemo(() => new Set(local.camps.filter((c) => String(c.status) === "Active" && c.extId).map((c) => String(c.extId))), [local.camps]);
  const terms = useMemo(() => [...new Set(q.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 8), [q]);

  const v = useMemo(() => {
    if (!data) return null;
    const rows = (data.rows || []).filter((r) => !running || activeIds.has(r.campaignId) || !activeIds.size);
    const campList = [...new Map(rows.map((r) => [r.campaignId, r.campaign])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const mine = camps.length ? rows.filter((r) => camps.includes(r.campaignId)) : rows;
    const days = lqDays(data.since, data.until);
    const blank = () => ({ leads: 0, chats: 0, spend: 0 });
    const add = (o, r) => { o.leads += r.leads; o.chats += r.chats; o.spend += r.spend; };
    const hit = (r, t) => lrKeyword(`${r.campaign} ${r.adset}`, t);

    /* Har keyword ek series (keyword na ho to "All leads") */
    const defs = terms.length ? terms.map((t, i) => ({ key: t, label: t, color: LQ_COLORS[i % LQ_COLORS.length], test: (r) => hit(r, t) }))
      : [{ key: "__all", label: camps.length ? "Selected campaigns" : "All leads", color: "#2a78d6", test: () => true }];
    const series = defs.map((d) => {
      const byDay = new Map(days.map((x) => [x, blank()]));
      const tot = blank(); const cs = new Set(); const as = new Set();
      mine.forEach((r) => { if (!d.test(r)) return; const o = byDay.get(r.day); if (o) add(o, r); add(tot, r); cs.add(r.campaignId); as.add(r.adsetId); });
      const daily = days.map((x) => byDay.get(x));
      const best = daily.reduce((b, o, i) => (o.leads > (b ? daily[b.i].leads : -1) ? { i } : b), null);
      return { ...d, daily, tot, campaigns: cs.size, adsets: as.size, best: best && daily[best.i].leads ? days[best.i] : "" };
    });

    /* Jo row kisi bhi keyword se mile (keyword na ho to saari) */
    const matched = terms.length ? mine.filter((r) => terms.some((t) => hit(r, t))) : mine;
    const tot = blank();
    const cmap = new Map();
    const dayTot = new Map(days.map((x) => [x, blank()]));
    matched.forEach((r) => {
      add(tot, r);
      const dt = dayTot.get(r.day); if (dt) add(dt, r);
      const c = cmap.get(r.campaignId) || { id: r.campaignId, name: r.campaign, ...blank(), days: new Set(), sets: new Map() };
      add(c, r); if (r.leads) c.days.add(r.day);
      const st = c.sets.get(r.adsetId) || { id: r.adsetId, name: r.adset, ...blank(), days: new Set() };
      add(st, r); if (r.leads) st.days.add(r.day);
      c.sets.set(r.adsetId, st); cmap.set(r.campaignId, c);
    });
    const list = [...cmap.values()].map((c) => ({ ...c, sets: [...c.sets.values()].sort((a, b) => b.leads - a.leads || b.spend - a.spend) }))
      .sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    const allLeads = mine.reduce((n, r) => n + r.leads, 0);
    const dayRows = days.map((d) => ({ d, ...dayTot.get(d) }));
    const best = dayRows.reduce((b, x) => (!b || x.leads > b.leads ? x : b), null);
    const withLeads = dayRows.filter((x) => x.leads > 0).length;
    /* Pehla aadha vs doosra aadha — badh raha hai ya ghat raha */
    const half = Math.floor(dayRows.length / 2);
    const a1 = dayRows.slice(0, half).reduce((n, x) => n + x.leads, 0);
    const a2 = dayRows.slice(dayRows.length - half).reduce((n, x) => n + x.leads, 0);
    const trend = half && a1 ? ((a2 - a1) / a1) * 100 : null;
    return { campList, days, series, list, tot, allLeads, dayRows, best, withLeads, trend, setCount: list.reduce((n, c) => n + c.sets.length, 0) };
  }, [data, camps, running, activeIds, terms]);

  const chartSeries = (v?.series || []).map((s) => ({ key: s.key, label: s.label, color: s.color, vals: s.daily.map((o) => lqVal(o, metric)) }));
  const tag = data ? `${data.since}-to-${data.until}` : "";
  function exportDays() {
    const head = ["Date", ...(terms.length ? v.series.map((s) => `${s.label} leads`) : []), "Form leads", "Chats", "Spend", "Cost per lead"];
    lrCsv(`vakilkaro-leads-by-day-${tag}.csv`, head, [...v.dayRows].reverse().map((x, ri) => {
      const i = v.dayRows.length - 1 - ri;
      return [x.d, ...(terms.length ? v.series.map((s) => s.daily[i].leads) : []), x.leads, x.chats, x.spend.toFixed(2), x.leads ? (x.spend / x.leads).toFixed(2) : ""];
    }));
  }
  function exportCamps() {
    const out = [];
    v.list.forEach((c) => {
      out.push([c.name, "", c.leads, c.chats, c.spend.toFixed(2), c.leads ? (c.spend / c.leads).toFixed(2) : "", c.days.size]);
      c.sets.forEach((st) => out.push([c.name, st.name, st.leads, st.chats, st.spend.toFixed(2), st.leads ? (st.spend / st.leads).toFixed(2) : "", st.days.size]));
    });
    lrCsv(`vakilkaro-leads-by-campaign-${tag}.csv`, ["Campaign", "Ad set", "Form leads", "Chats", "Spend", "Cost per lead", "Days with leads"], out);
  }
  const inputStyle = { flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "600 13px var(--font)", color: "#1B2333" };
  const rangeTxt = data ? `${lrShort(data.since)}${data.since !== data.until ? ` – ${lrShort(data.until)}` : ""}` : "";

  return (
    <div className="st">
      <div className="lf-head">
        <div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div>
        <div className="lf-acts">
          {data?.at ? <span className="lf-at"><i className="fa-solid fa-rotate" /> Loaded {new Date(data.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          <button type="button" className="btn btn-gold" disabled={busy || !R} onClick={() => fetchData(true)}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {busy ? "Loading from Meta..." : "Refresh from Meta"}
          </button>
        </div>
      </div>

      <div className="st-filters">
        <label className="st-sel"><i className="fa-regular fa-calendar" />
          <select value={period} onChange={(e) => { const k = e.target.value; if (k === "custom" && !cf) { const r0 = lrRange("7"); setCf(r0.from); setCt(r0.to); } setPeriod(k); }} aria-label="Period">
            {LQ_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        {period === "custom" ? (
          <>
            <label className="st-sel" style={{ paddingRight: 12 }}><span style={{ fontSize: 12, color: "#646B7E", fontWeight: 600 }}>From</span>
              <input type="date" value={cf} max={ct || undefined} onChange={(e) => setCf(e.target.value)} aria-label="From date" style={inputStyle} /></label>
            <label className="st-sel" style={{ paddingRight: 12 }}><span style={{ fontSize: 12, color: "#646B7E", fontWeight: 600 }}>To</span>
              <input type="date" value={ct} min={cf || undefined} onChange={(e) => setCt(e.target.value)} aria-label="To date" style={inputStyle} /></label>
            <button type="button" className="btn btn-gold" disabled={busy || !cf || !ct} onClick={applyCustom}><i className="fa-solid fa-check" /> Apply</button>
          </>
        ) : null}
        <label className={`st-sel wide${q ? " on" : ""}`} style={{ paddingRight: 10 }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keywords — e.g. TM, GST, NGO" aria-label="Keywords" style={inputStyle} />
          {q ? <button type="button" onClick={() => setQ("")} aria-label="Clear keywords" style={{ border: 0, background: "none", cursor: "pointer", color: "#959CAE", padding: 0 }}><i className="fa-solid fa-xmark" /></button> : null}
        </label>
        <MultiPick icon="fa-bullhorn" noun="campaigns" allLabel={`All ${running ? "running " : ""}campaigns`}
          options={(v?.campList || []).map(([id, name]) => ({ id, label: name }))} value={camps} onChange={setCamps} />
        <label className="st-check"><input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} /> Running campaigns only</label>
        {camps.length || q ? <button type="button" className="ph-clear" onClick={() => { setCamps([]); setQ(""); }}>Clear</button> : null}
      </div>

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
      {data?.errors?.length ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> {data.errors.map((e) => e.message).join(" · ")}</div> : null}

      {!v ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-chart-line"}`} /><b>{busy ? "Reading day-wise data from Meta..." : period === "custom" && !applied ? "Pick the dates" : "No data yet"}</b><span>{period === "custom" && !applied ? "Choose From and To, then press Apply." : "Press “Refresh from Meta”."}</span></div></div>
      ) : (
        <>
          <div className="lf-stats">
            <div><span>Form leads{terms.length ? ` · ${terms.join(", ")}` : ""}</span><b>{num(v.tot.leads)}</b><em>{terms.length ? `${pct(v.tot.leads, v.allLeads).toFixed(0)}% of ${num(v.allLeads)} · ` : ""}{v.list.length} campaigns · {v.setCount} ad sets</em></div>
            <div><span>Spend</span><b>{inr(v.tot.spend)}</b><em>{v.tot.leads ? `${inr(v.tot.spend / v.tot.leads, 2)} per lead` : "—"} · {num(v.tot.chats)} chats</em></div>
            <div><span>Average per day</span><b>{(v.tot.leads / Math.max(1, v.days.length)).toFixed(1)}</b><em>{v.withLeads} of {v.days.length} days had leads</em></div>
            <div><span>Best day</span><b className="st-txt">{v.best && v.best.leads ? lrShort(v.best.d) : "—"}</b><em>{v.best && v.best.leads ? `${num(v.best.leads)} leads` : ""}{v.trend != null ? ` · ${v.trend >= 0 ? "▲" : "▼"} ${Math.abs(v.trend).toFixed(0)}% 2nd half vs 1st` : ""}</em></div>
          </div>

          {/* ---- graph ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-chart-line" /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>{LQ_METRICS.find((m) => m.key === metric)?.label} by day</b><small>{rangeTxt}{terms.length > 1 ? " · one line per keyword" : ""} · hover to see a day</small></div>
              <label className="st-sel"><i className="fa-solid fa-chart-simple" />
                <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Graph shows">
                  {LQ_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select><i className="fa-solid fa-chevron-down st-cv" />
              </label>
            </div>
            <div style={{ padding: "4px 14px 6px" }}>
              {chartSeries.length > 1 || terms.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", padding: "0 4px 6px", fontSize: 12.5, fontWeight: 600, color: "#334155" }}>
                  {chartSeries.map((s) => <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />{s.label}</span>)}
                </div>
              ) : null}
              <LqChart days={v.days} series={chartSeries} metric={metric} />
            </div>
          </section>

          {/* ---- keyword tally ---- */}
          {terms.length ? (
            <section className="card st-card">
              <div className="st-card-h">
                <span className="lf-form-ic"><i className="fa-solid fa-tags" /></span>
                <div><b>Keywords compared</b><small>Leads that each keyword brought in {rangeTxt}</small></div>
              </div>
              <div className="tbl-scroll">
                <table className="mod-table st-t">
                  <thead><tr><th>Keyword</th><th className="ta-r">Campaigns</th><th className="ta-r">Ad sets</th><th className="ta-r">Form leads</th><th className="ta-r">Share</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th><th>Best day</th></tr></thead>
                  <tbody>
                    {v.series.map((s) => (
                      <tr key={s.key}>
                        <td><b><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: s.color, marginRight: 8 }} />{s.label}</b></td>
                        <td className="ta-r">{s.campaigns}</td>
                        <td className="ta-r">{s.adsets}</td>
                        <td className="ta-r"><b>{num(s.tot.leads)}</b></td>
                        <td className="ta-r">{pct(s.tot.leads, v.allLeads).toFixed(1)}%</td>
                        <td className="ta-r">{num(s.tot.chats)}</td>
                        <td className="ta-r">{inr(s.tot.spend, 2)}</td>
                        <td className="ta-r">{s.tot.leads ? inr(s.tot.spend / s.tot.leads, 2) : <span className="mut">—</span>}</td>
                        <td>{s.best ? lrShort(s.best) : <span className="mut">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* ---- campaigns ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-solid fa-bullhorn" /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>Campaigns &amp; ad sets</b><small>{terms.length ? `Matching ${terms.map((t) => `“${t}”`).join(", ")}` : camps.length ? `${camps.length} campaigns` : "All campaigns"} · click a campaign to see its ad sets</small></div>
              <button type="button" className="btn btn-ghost" onClick={exportCamps} disabled={!v.list.length}><i className="fa-solid fa-file-csv" /> CSV</button>
            </div>
            {v.list.length ? (
              <div className="tbl-scroll" style={{ maxHeight: 480 }}>
                <table className="mod-table st-t">
                  <thead><tr><th>Campaign / ad set</th><th className="ta-r">Form leads</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th><th className="ta-r">Days with leads</th></tr></thead>
                  <tbody>
                    {v.list.map((c) => (
                      <Fragment key={c.id}>
                        <tr onClick={() => setOpenC((o) => ({ ...o, [c.id]: !o[c.id] }))} style={{ cursor: "pointer", background: openC[c.id] ? "#FFFBF0" : undefined }}>
                          <td style={openC[c.id] ? { background: "#FFFBF0" } : undefined}><b><i className={`fa-solid fa-chevron-${openC[c.id] ? "down" : "right"}`} style={{ fontSize: 10, color: "#959CAE", marginRight: 8 }} />{c.name}</b><small className="mut" style={{ display: "block", marginLeft: 18 }}>{c.sets.length} ad set{c.sets.length === 1 ? "" : "s"}</small></td>
                          <td className="ta-r"><b>{num(c.leads)}</b></td>
                          <td className="ta-r">{num(c.chats)}</td>
                          <td className="ta-r">{inr(c.spend, 2)}</td>
                          <td className="ta-r">{c.leads ? inr(c.spend / c.leads, 2) : <span className="mut">—</span>}</td>
                          <td className="ta-r">{c.days.size}</td>
                        </tr>
                        {openC[c.id] ? c.sets.map((st) => (
                          <tr key={`${c.id}-${st.id}`} style={{ background: "#FAFBFD" }}>
                            <td style={{ paddingLeft: 34, background: "#FAFBFD" }}><i className="fa-solid fa-layer-group" style={{ fontSize: 11, color: "#959CAE", marginRight: 6 }} />{st.name}</td>
                            <td className="ta-r"><b>{num(st.leads)}</b></td>
                            <td className="ta-r">{num(st.chats)}</td>
                            <td className="ta-r">{inr(st.spend, 2)}</td>
                            <td className="ta-r">{st.leads ? inr(st.spend / st.leads, 2) : <span className="mut">—</span>}</td>
                            <td className="ta-r">{st.days.size}</td>
                          </tr>
                        )) : null}
                      </Fragment>
                    ))}
                    <tr style={{ background: "#F4F5FA" }}>
                      <td style={{ background: "#F4F5FA" }}><b>Total</b></td>
                      <td className="ta-r" style={{ background: "#F4F5FA" }}><b>{num(v.tot.leads)}</b></td>
                      <td className="ta-r" style={{ background: "#F4F5FA" }}><b>{num(v.tot.chats)}</b></td>
                      <td className="ta-r" style={{ background: "#F4F5FA" }}><b>{inr(v.tot.spend, 2)}</b></td>
                      <td className="ta-r" style={{ background: "#F4F5FA" }}><b>{v.tot.leads ? inr(v.tot.spend / v.tot.leads, 2) : "—"}</b></td>
                      <td className="ta-r" style={{ background: "#F4F5FA" }}><b>{v.withLeads}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="lf-empty"><i className="fa-solid fa-magnifying-glass" /><b>Nothing found</b><span>{terms.length ? "No campaign or ad set has these keywords in its name in this period." : "No ads ran in this period."}</span></div>}
          </section>

          {/* ---- day-wise ---- */}
          <section className="card st-card">
            <div className="st-card-h">
              <span className="lf-form-ic"><i className="fa-regular fa-calendar-days" /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>Day by day</b><small>Newest day first</small></div>
              <button type="button" className="btn btn-gold" onClick={exportDays}><i className="fa-solid fa-file-arrow-down" /> Export CSV</button>
            </div>
            <div className="tbl-scroll" style={{ maxHeight: 420 }}>
              <table className="mod-table st-t">
                <thead><tr><th>Date</th>{terms.length ? v.series.map((s) => <th key={s.key} className="ta-r" style={{ color: s.color }}>{s.label}</th>) : null}<th className="ta-r">Form leads</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th></tr></thead>
                <tbody>
                  {[...v.dayRows].reverse().map((x, ri) => {
                    const i = v.dayRows.length - 1 - ri;
                    return (
                      <tr key={x.d}>
                        <td><b>{lrShort(x.d)}</b></td>
                        {terms.length ? v.series.map((s) => <td key={s.key} className="ta-r">{s.daily[i].leads ? num(s.daily[i].leads) : <span className="mut">–</span>}</td>) : null}
                        <td className="ta-r"><b>{num(x.leads)}</b></td>
                        <td className="ta-r">{num(x.chats)}</td>
                        <td className="ta-r">{inr(x.spend, 2)}</td>
                        <td className="ta-r">{x.leads ? inr(x.spend / x.leads, 2) : <span className="mut">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p className="st-note"><i className="fa-solid fa-circle-info" /> Keywords look at campaign and ad set names — “TM” also finds “Trademark”. Separate keywords with a comma to compare them (up to 8). Up to {LQ_MAXDAYS} days at a time.</p>
        </>
      )}
    </div>
  );
}