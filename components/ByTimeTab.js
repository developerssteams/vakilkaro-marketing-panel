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

import { useEffect, useMemo, useRef, useState } from "react";
import { readRows } from "../lib/marketing-local";

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