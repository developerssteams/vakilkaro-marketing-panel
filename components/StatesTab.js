"use client";

/* ============================================================
   components/StatesTab.js — Campaigns → "States"

   Kaunsi lead kis state se aa rahi hai — Meta ke region breakdown se.
   Filter: period · campaign · state · sirf chal rahe campaigns.
     · State = All   → har state ki leads, chats, kharch, cost per lead
     · State chuna   → us state me kaunsa campaign kitni leads de raha hai
   Neeche: Lead Capture me form me likha state (agar form poochhta hai).
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { usePaged } from "./Pager";

const CACHE = "vk_meta_regions";
const PERIODS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 6 },
  { key: "30", label: "Last 30 days", days: 29 },
  { key: "month", label: "This month", days: null },
  { key: "90", label: "Last 90 days", days: 89 },
];
const z = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
function rangeOf(key) {
  const to = new Date(); const from = new Date();
  if (key === "month") from.setDate(1);
  else from.setDate(from.getDate() - (PERIODS.find((p) => p.key === key)?.days || 0));
  return { since: iso(from), until: iso(to) };
}
const inr = (v, d = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: d, minimumFractionDigits: d }).format(Number(v) || 0);
const num = (v) => new Intl.NumberFormat("en-IN").format(Math.round(Number(v) || 0));
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || "{}"); } catch { return {}; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* */ } };

export default function StatesTab({ tab }) {
  const [period, setPeriod] = useState("30");
  const [camp, setCamp] = useState("");
  const [state, setState] = useState("");
  const [running, setRunning] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [local, setLocal] = useState({ camps: [], leads: [], accounts: [] });

  useEffect(() => {
    const load = () => setLocal({
      camps: readRows("campaigns__live-ads"),
      leads: readRows("lead-capture__inbox-log"),
      accounts: readRows("ad-accounts__accounts"),
    });
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  async function fetchData(force = false) {
    const R = rangeOf(period);
    const cache = readCache();
    const hit = cache[period];
    if (!force && hit && hit.since === R.since && hit.until === R.until && Date.now() - Date.parse(hit.at || 0) < 3600000) { setData(hit); return; }
    const ids = [...new Set(local.accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, ...R }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Could not load state-wise data from Meta");
      else { setData(j); writeCache({ ...cache, [period]: j }); }
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (local.accounts.length) fetchData(); }, [period, local.accounts.length]);

  /* Chal rahe campaigns — panel ki list se (Meta ka effective status) */
  const activeIds = useMemo(() => new Set(local.camps.filter((c) => String(c.status) === "Active" && c.extId).map((c) => String(c.extId))), [local.camps]);

  const v = useMemo(() => {
    if (!data) return null;
    const rows = (data.rows || []).filter((r) => !running || activeIds.has(r.campaignId) || !activeIds.size);
    const camps = [...new Map(rows.map((r) => [r.campaignId, r.campaign])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const byCamp = camp ? rows.filter((r) => r.campaignId === camp) : rows;
    const states = {};
    byCamp.forEach((r) => {
      const s = states[r.region] = states[r.region] || { name: r.region, leads: 0, chats: 0, spend: 0, impressions: 0, clicks: 0, camps: new Set() };
      s.leads += r.leads; s.chats += r.chats; s.spend += r.spend; s.impressions += r.impressions; s.clicks += r.clicks;
      if (r.leads || r.chats || r.spend) s.camps.add(r.campaignId);
    });
    const list = Object.values(states).filter((s) => s.spend || s.leads || s.chats).sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    const tot = list.reduce((t, s) => ({ leads: t.leads + s.leads, chats: t.chats + s.chats, spend: t.spend + s.spend }), { leads: 0, chats: 0, spend: 0 });
    /* Ek state chuna — us state me har campaign */
    const inState = state ? Object.values(byCamp.filter((r) => r.region === state).reduce((m, r) => {
      const c = m[r.campaignId] = m[r.campaignId] || { id: r.campaignId, name: r.campaign, leads: 0, chats: 0, spend: 0, impressions: 0 };
      c.leads += r.leads; c.chats += r.chats; c.spend += r.spend; c.impressions += r.impressions; return m;
    }, {})).sort((a, b) => b.leads - a.leads || b.spend - a.spend) : [];
    const withLeads = list.filter((s) => s.leads >= 5);
    const cheapest = withLeads.length ? withLeads.reduce((a, s) => (s.spend / s.leads < a.spend / a.leads ? s : a)) : null;
    return { camps, list, tot, inState, top: list[0] || null, cheapest, allStates: list.map((s) => s.name).sort() };
  }, [data, camp, state, running, activeIds]);

  /* Form me likha state (Lead Capture) — sirf jinke form me state poochha gaya */
  const formStates = useMemo(() => {
    const R = rangeOf(period);
    const m = {};
    local.leads.forEach((l) => {
      const d = String(l.receivedAt || "").slice(0, 10);
      if (d < R.since || d > R.until || !l.state) return;
      const k = String(l.state).trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [local.leads, period]);

  const pgStates = usePaged(v?.list || [], `${camp}|${running}|${period}`);
  const pgCamp = usePaged(v?.inState || [], `${state}|${camp}|${running}|${period}`);
  const maxLeads = Math.max(1, ...(v?.list || []).map((s) => s.leads));
  const R = rangeOf(period);

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
        <label className={`st-sel wide${camp ? " on" : ""}`}><i className="fa-solid fa-bullhorn" />
          <select value={camp} onChange={(e) => setCamp(e.target.value)} aria-label="Campaign">
            <option value="">All {running ? "running " : ""}campaigns{v ? ` (${v.camps.length})` : ""}</option>
            {(v?.camps || []).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        <label className={`st-sel${state ? " on" : ""}`}><i className="fa-solid fa-map-location-dot" />
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">All states{v ? ` (${v.list.length})` : ""}</option>
            {(v?.allStates || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        <label className="st-check"><input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} /> Running campaigns only</label>
        {camp || state ? <button type="button" className="ph-clear" onClick={() => { setCamp(""); setState(""); }}>Clear</button> : null}
      </div>

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
      {data?.errors?.length ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> {data.errors.map((e) => e.message).join(" · ")}</div> : null}

      {!v ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-map-location-dot"}`} /><b>{busy ? "Reading state-wise data from Meta..." : "No data yet"}</b><span>Press "Refresh from Meta".</span></div></div>
      ) : (
        <>
          {/* ---- summary ---- */}
          <div className="lf-stats">
            <div><span>Form leads</span><b>{num(v.tot.leads)}</b><em>{R.since === R.until ? R.since : `${R.since} → ${R.until}`}</em></div>
            <div><span>States with leads</span><b>{v.list.filter((s) => s.leads).length}</b><em>of {v.list.length} states with spend</em></div>
            <div><span>Top state</span><b className="st-txt">{v.top?.leads ? v.top.name : "—"}</b><em>{v.top?.leads ? `${num(v.top.leads)} leads · ${pct(v.top.leads, v.tot.leads).toFixed(0)}%` : ""}</em></div>
            <div><span>Cheapest state</span><b className="st-txt">{v.cheapest ? v.cheapest.name : "—"}</b><em>{v.cheapest ? `${inr(v.cheapest.spend / v.cheapest.leads, 2)} per lead` : "needs 5+ leads"}</em></div>
          </div>

          {!state ? (
            <section className="card st-card">
              <div className="st-card-h">
                <span className="lf-form-ic"><i className="fa-solid fa-map-location-dot" /></span>
                <div><b>Leads by state</b><small>{camp ? v.camps.find(([id]) => id === camp)?.[1] : "All campaigns"} · click a state to see its campaigns</small></div>
              </div>
              {v.list.length ? (
                <div className="tbl-scroll">
                  <table className="mod-table st-t">
                    <thead><tr><th>#</th><th>State</th><th className="ta-r">Form leads</th><th>Share</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th><th className="ta-r">Campaigns</th></tr></thead>
                    <tbody>
                      {pgStates.rows.map((s, i) => (
                        <tr key={s.name} className="st-row" onClick={() => setState(s.name)} title={`See campaigns in ${s.name}`}>
                          <td className="mut">{pgStates.offset + i + 1}</td>
                          <td><b>{s.name}</b></td>
                          <td className="ta-r"><b>{num(s.leads)}</b></td>
                          <td><span className="st-bar"><i style={{ width: `${(s.leads / maxLeads) * 100}%` }} /></span><small className="mut"> {pct(s.leads, v.tot.leads).toFixed(1)}%</small></td>
                          <td className="ta-r">{num(s.chats)}</td>
                          <td className="ta-r">{inr(s.spend, 2)}</td>
                          <td className="ta-r">{s.leads ? inr(s.spend / s.leads, 2) : <span className="mut">—</span>}</td>
                          <td className="ta-r">{s.camps.size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="lf-empty"><i className="fa-solid fa-map" /><b>No state data</b><span>No spend in this period for these campaigns.</span></div>}
              {pgStates.pager}
            </section>
          ) : (
            <section className="card st-card">
              <div className="st-card-h">
                <span className="lf-form-ic"><i className="fa-solid fa-location-dot" /></span>
                <div><b>{state}</b><small>Which campaign brings leads from {state}</small></div>
                <button type="button" className="btn btn-ghost st-back" onClick={() => setState("")}><i className="fa-solid fa-arrow-left" /> All states</button>
              </div>
              {v.inState.length ? (
                <div className="tbl-scroll">
                  <table className="mod-table st-t">
                    <thead><tr><th>Campaign</th><th className="ta-r">Form leads</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th><th className="ta-r">Impressions</th></tr></thead>
                    <tbody>
                      {pgCamp.rows.map((c) => (
                        <tr key={c.id}>
                          <td><b>{c.name}</b></td>
                          <td className="ta-r"><b>{num(c.leads)}</b></td>
                          <td className="ta-r">{num(c.chats)}</td>
                          <td className="ta-r">{inr(c.spend, 2)}</td>
                          <td className="ta-r">{c.leads ? inr(c.spend / c.leads, 2) : <span className="mut">—</span>}</td>
                          <td className="ta-r">{num(c.impressions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="lf-empty"><i className="fa-solid fa-location-dot" /><b>No campaign reached {state}</b><span>Try another period or campaign.</span></div>}
              {pgCamp.pager}
            </section>
          )}

          {formStates.length ? (
            <section className="card st-card">
              <div className="st-card-h">
                <span className="lf-form-ic"><i className="fa-solid fa-pen-to-square" /></span>
                <div><b>State written in the lead form</b><small>From Lead Capture — only forms that ask for the state</small></div>
              </div>
              <div className="lf-chips st-chips">
                {formStates.map(([s, n]) => <span key={s} className="lf-chip"><i className="fa-solid fa-location-dot" /> {s} <em>{n}</em></span>)}
              </div>
            </section>
          ) : null}

          <p className="st-note"><i className="fa-solid fa-circle-info" /> State comes from Meta — where the person was when they saw the ad. It can differ slightly from the state they type in the form.</p>
        </>
      )}
    </div>
  );
}
