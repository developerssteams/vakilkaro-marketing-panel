"use client";

/* ============================================================
   components/StatesTab.js — Campaigns → "States"

   Kaunsi lead kis state se aa rahi hai — Meta ke region breakdown se.
   Filter: period · campaign · ad set · state · sirf chal rahe campaigns / ad sets.
     · State = All   → har state ki leads, chats, kharch, cost per lead
     · State chuna   → us state me kaunsa campaign kitni leads de raha hai
   Neeche: Lead Capture me form me likha state (agar form poochhta hai).
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [camps, setCamps] = useState([]);     /* khaali = saare */
  const [adsets, setAdsets] = useState([]);   /* khaali = saare */
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
    /* Purana cache (bina ad set ke) ho to dobara laao */
    if (!force && hit && hit.level === "adset" && hit.since === R.since && hit.until === R.until && Date.now() - Date.parse(hit.at || 0) < 3600000) { setData(hit); return; }
    const ids = [...new Set(local.accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, ...R, level: "adset" }) });
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
    /* Ad set ka chalna Meta se (adsetActive). Meta ne status na diya ho to ye filter chhod do */
    const setStatusKnown = (data.rows || []).some((r) => r.adsetActive);
    const rows = (data.rows || []).filter((r) => !running || ((activeIds.has(r.campaignId) || !activeIds.size) && (!setStatusKnown || !r.adsetId || r.adsetActive)));
    const campList = [...new Map(rows.map((r) => [r.campaignId, r.campaign])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const inCamp = camps.length ? rows.filter((r) => camps.includes(r.campaignId)) : rows;
    /* Ad sets — campaign chuna ho to sirf uske */
    const sets = [...new Map(inCamp.filter((r) => r.adsetId).map((r) => [r.adsetId, { id: r.adsetId, name: r.adset || r.adsetId, campaign: r.campaign }])).values()]
      .sort((a, b) => String(a.campaign).localeCompare(String(b.campaign)) || String(a.name).localeCompare(String(b.name)));
    const byCamp = adsets.length ? inCamp.filter((r) => adsets.includes(r.adsetId)) : inCamp;
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
    return { camps: campList, sets, list, tot, inState, top: list[0] || null, cheapest, allStates: list.map((s) => s.name).sort() };
  }, [data, camps, adsets, state, running, activeIds]);

  /* Campaign badle aur chune hue ad sets un campaigns ke nahi → unhe hata do */
  useEffect(() => {
    if (!adsets.length || !v) return;
    const keep = adsets.filter((id) => v.sets.some((x) => x.id === id));
    if (keep.length !== adsets.length) setAdsets(keep);
  }, [v, adsets]);

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

  const pgStates = usePaged(v?.list || [], `${camps.join(",")}|${adsets.join(",")}|${running}|${period}`);
  const pgCamp = usePaged(v?.inState || [], `${state}|${camps.join(",")}|${adsets.join(",")}|${running}|${period}`);
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
        <MultiPick
          icon="fa-bullhorn" noun="campaigns" allLabel={`All ${running ? "running " : ""}campaigns`}
          options={(v?.camps || []).map(([id, name]) => ({ id, label: name }))}
          value={camps} onChange={setCamps}
        />
        <MultiPick
          icon="fa-layer-group" noun="ad sets" allLabel={`All ${running ? "running " : ""}ad sets`}
          options={(v?.sets || []).map((x) => ({ id: x.id, label: x.name, sub: camps.length === 1 ? "" : x.campaign }))}
          value={adsets} onChange={setAdsets}
        />
        <label className={`st-sel${state ? " on" : ""}`}><i className="fa-solid fa-map-location-dot" />
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">All states{v ? ` (${v.list.length})` : ""}</option>
            {(v?.allStates || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select><i className="fa-solid fa-chevron-down st-cv" />
        </label>
        <label className="st-check"><input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} /> Running campaigns &amp; ad sets only</label>
        {camps.length || adsets.length || state ? <button type="button" className="ph-clear" onClick={() => { setCamps([]); setAdsets([]); setState(""); }}>Clear</button> : null}
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
                <div><b>Leads by state</b><small>{pickLabel(camps, v.camps.map(([id, name]) => ({ id, label: name })), "All campaigns", "campaigns")}{adsets.length ? ` › ${pickLabel(adsets, v.sets.map((x) => ({ id: x.id, label: x.name })), "", "ad sets")}` : ""} · click a state to see its campaigns</small></div>
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

/* "All campaigns" · ek chuna to uska naam · zyada chune to "3 campaigns" */
function pickLabel(value, options, allLabel, noun) {
  if (!value.length) return allLabel;
  if (value.length === 1) return options.find((o) => o.id === value[0])?.label || `1 ${noun}`;
  return `${value.length} ${noun} selected`;
}

/* ============================================================
   MultiPick — checkbox wala dropdown (ek saath kai campaigns / ad sets)
   Kuch na chuna = saare. Search, "Select all" aur "Clear" bhi.
   ============================================================ */
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
  const shown = t ? options.filter((o) => `${o.label} ${o.sub || ""}`.toLowerCase().includes(t)) : options;
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
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: "#1B2333", wordBreak: "break-word" }}>{o.label}</span>
                    {o.sub ? <small style={{ fontSize: 11, color: "#7A8295" }}>{o.sub}</small> : null}
                  </span>
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