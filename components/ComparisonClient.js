"use client";

/* ============================================================
   components/ComparisonClient.js — Comparison module

   Teen view:
     1. Platform vs Platform — ek hi time, alag platform
     2. Mahine vs Mahine     — ek ya zyada platform, mahine-wise
     3. Conversion Funnel    — Impression → Click → Lead → Converted

   Har jagah: spend, leads, cost per lead, converted, conversion %,
   cost per conversion, aur 3D graph. Auto-sync se naya data aate hi
   page khud update hota hai.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PLATFORMS, METRICS, RANGES, platformOf, metricOf, loadData, aggregate, resolve,
  lastMonths, monthsInData, monthLabel, monthRange, isPartialMonth, delta, winnerOf, coverage,
} from "../lib/compare-data";
import { Bars3D, Funnel3D, TrendLine } from "./Chart3D";
import { money, money2, count } from "./ModuleParts";
import { runMetaSync, panelMetaAccountIds, isoAgo, readSyncState } from "../lib/sync-merge";
import { useToast } from "./Toast";

const FMT = {
  money: (v) => money(v), money2: (v) => money2(v), count: (v) => count(Math.round(v)),
  pct: (v) => `${(Number(v) || 0).toFixed(Number(v) >= 10 ? 1 : 2)}%`,
};
const fmtOf = (k) => FMT[metricOf(k).fmt];
/* 3D graph ke upar chhota number — ₹1.2L, 3.4K */
const short = (k) => (v) => {
  const m = metricOf(k);
  if (m.fmt === "pct") return `${(Number(v) || 0).toFixed(1)}%`;
  const a = Math.abs(v); const pre = m.fmt.startsWith("money") ? "₹" : "";
  if (a >= 1e7) return `${pre}${(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${pre}${(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${pre}${(v / 1e3).toFixed(1)}K`;
  return `${pre}${Math.round(v)}`;
};

const MODES = [
  { key: "platform", label: "Platform vs Platform", icon: "fa-solid fa-code-compare" },
  { key: "month", label: "Month vs Month", icon: "fa-solid fa-calendar-days" },
  { key: "funnel", label: "Conversion Funnel", icon: "fa-solid fa-filter" },
];
/* Full comparison table ke sections */
const FT_GROUPS = [
  { label: "Spend and reach", keys: ["spend", "impressions", "cpm"] },
  { label: "Traffic", keys: ["linkClicks", "ctr"] },
  { label: "Leads", keys: ["results", "cpl", "formLeads", "chats", "clickToLead"] },
  { label: "Conversion", keys: ["panelLeads", "captureRate", "converted", "convRate", "cpc"] },
];
const CHART_METRICS = ["results", "spend", "cpl", "panelLeads", "converted", "convRate", "cpc", "ctr"];
const RATIO = ["cpl", "convRate", "cpc", "ctr", "cpm", "clickToLead", "captureRate"];

export default function ComparisonClient() {
  const { show } = useToast();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("platform");
  const [picked, setPicked] = useState(["Facebook", "Instagram"]);
  const [range, setRange] = useState("30");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [chartMetric, setChartMetric] = useState("results");
  const [monthCount, setMonthCount] = useState(6);
  const [monthA, setMonthA] = useState(""); const [monthB, setMonthB] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncAt, setSyncAt] = useState("");
  /* 3D ya flat — pasand yaad rakhte hain */
  const [chartMode, setChartModeRaw] = useState("3d");
  useEffect(() => { try { const v = localStorage.getItem("vk_cmp_chart"); if (v === "2d" || v === "3d") setChartModeRaw(v); } catch { /* */ } }, []);
  const setChartMode = (v) => { setChartModeRaw(v); try { localStorage.setItem("vk_cmp_chart", v); } catch { /* */ } };

  /* Data padho — aur jab bhi auto-sync naya laaye, dobara */
  useEffect(() => {
    const load = () => { setData(loadData()); setSyncAt(readSyncState()?.at || ""); };
    load();
    window.addEventListener("vk-marketing-updated", load);
    window.addEventListener("vk-meta-sync-state", load);
    return () => { window.removeEventListener("vk-marketing-updated", load); window.removeEventListener("vk-meta-sync-state", load); };
  }, []);

  /* Jin platform pe data hai, unhe pehli baar khud chun lo */
  useEffect(() => {
    if (!data) return;
    const has = ["Facebook", "Instagram", "YouTube", "Website"].filter((k) => data.daily.some((d) => d.channel === k));
    if (has.length >= 2) setPicked(has);
    else if (has.length === 1) setPicked([has[0], "Meta"].filter((v, i, a) => a.indexOf(v) === i));
  }, [Boolean(data)]);

  useEffect(() => { if (!picked.includes(focus)) setFocus(picked[0] || ""); }, [picked, focus]);

  const toggle = (k) => setPicked((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : [...p, k]));

  async function pullHistory() {
    const ids = panelMetaAccountIds();
    if (!ids.length) { show("Connect a Meta account in Ad Accounts first.", "error"); return; }
    setBusy(true);
    try {
      const r = await runMetaSync({ accountIds: ids, since: isoAgo(365), until: isoAgo(0), full: true });
      if (!r.ok) show(r.error, "error");
      else show(`12 months of data loaded — ${count(r.daily)} day-wise entries.`, "success");
    } finally { setBusy(false); }
  }

  if (!data) return <div className="cp-loading"><i className="fa-solid fa-spinner fa-spin" /> Loading data...</div>;

  const [rf, rt] = resolve(range, from, to);
  const months = monthA && monthB ? [monthA, monthB].sort() : lastMonths(monthCount);
  const allMonths = monthsInData(data);
  const noData = !data.daily.length;

  return (
    <div className="cp-wrap">
      {/* ---------- header: shaant, kaam ki jaankari ---------- */}
      <header className="vd-head">
        <div>
          <h1 className="vd-title">Comparison</h1>
          <p className="vd-lede">Which platform brings cheaper leads, what changed month to month, and how many leads became orders.</p>
        </div>
        <div className="vd-meta">
          <div><span>Data from</span><b>{data.first ? fmtDate(data.first) : "—"}</b></div>
          <div><span>Months of data</span><b>{count(allMonths.length)}</b></div>
          <div><span>Converted leads</span><b>{count(data.conv.length)}</b></div>
          <div className="vd-live"><i /> {syncAt ? ago(syncAt) : "Waiting for first sync"}</div>
          <button type="button" className="vd-hist" disabled={busy} onClick={pullHistory}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-clock-rotate-left"}`} /> {busy ? "Loading..." : "Load 12 months"}
          </button>
        </div>
      </header>

      {/* ---------- mode ---------- */}
      <div className="cp-modes">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={mode === m.key ? "on" : ""} onClick={() => setMode(m.key)}>
            <i className={m.icon} /> {m.label}
          </button>
        ))}
      </div>

      {/* ---------- controls ---------- */}
      <div className="cp-controls">
        <div className="cp-chips">
          {PLATFORMS.map((p) => (
            <button key={p.key} type="button" className={`cp-chip${picked.includes(p.key) ? " on" : ""}`}
              style={{ "--c": p.color }} onClick={() => toggle(p.key)} aria-pressed={picked.includes(p.key)}>
              <i className={p.icon} /> {p.label}
            </button>
          ))}
        </div>
        <div className="cp-ctl-r">
          {mode !== "month" ? (
            <>
              <select className="cp-select" value={range} onChange={(e) => setRange(e.target.value)}>
                {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              {range === "custom" ? (
                <>
                  <input className="cp-select" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <input className="cp-select" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </>
              ) : null}
            </>
          ) : (
            <>
              <select className="cp-select" value={monthA && monthB ? "pick" : String(monthCount)}
                onChange={(e) => { if (e.target.value === "pick") { setMonthA(allMonths[allMonths.length - 2] || lastMonths(2)[0]); setMonthB(allMonths[allMonths.length - 1] || lastMonths(1)[0]); } else { setMonthA(""); setMonthB(""); setMonthCount(Number(e.target.value)); } }}>
                <option value="3">Last 3 months</option>
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="pick">Pick two months (A vs B)</option>
              </select>
              {monthA && monthB ? (
                <>
                  <input className="cp-select" type="month" value={monthA} onChange={(e) => setMonthA(e.target.value)} />
                  <span className="cp-vs">vs</span>
                  <input className="cp-select" type="month" value={monthB} onChange={(e) => setMonthB(e.target.value)} />
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {noData ? (
        <div className="cp-empty">
          <i className="fa-solid fa-chart-column" />
          <b>No data yet</b>
          <span>Connect an account from Ad Accounts → Connect Meta Account, or add daily entries in Campaigns. The comparison will appear here.</span>
        </div>
      ) : mode === "platform" ? (
        <PlatformView data={data} picked={picked} from={rf} to={rt} range={range} chartMetric={chartMetric} setChartMetric={setChartMetric} chartMode={chartMode} setChartMode={setChartMode} />
      ) : mode === "month" ? (
        <MonthView data={data} picked={picked} months={months} focus={focus} setFocus={setFocus} chartMetric={chartMetric} setChartMetric={setChartMetric} chartMode={chartMode} setChartMode={setChartMode} />
      ) : (
        <FunnelView data={data} picked={picked} from={rf} to={rt} />
      )}

      <div className="cp-note">
        <i className="fa-solid fa-circle-info" />
        <span>
          <b>Leads</b> = Ads Manager Results. <b>Reached panel</b> = leads that reached Lead Capture (excluding Junk / Duplicate).
          <b> Converted</b> = of those, Stage "Converted". <b>Conversion %</b> = Converted ÷ Reached panel — both from the same data. A conversion is counted on the day the lead <b>arrived</b> . Periods with no data show "—" (not 0).
          {data.unknownMeta ? <> {count(data.unknownMeta)} leads only have "Meta" as source — they are not split into Facebook / Instagram, only counted in "Meta (FB + IG)" and "All combined".</> : null}
        </span>
      </div>
    </div>
  );
}

/* ================= 1 · Platform vs Platform ================= */
function PlatformView({ data, picked, from, to, range, chartMetric, setChartMetric, chartMode, setChartMode }) {
  const cur = useMemo(() => picked.map((k) => ({ p: platformOf(k), t: aggregate(data, k, from, to) })), [data, picked, from, to]);

  /* Pichla barabar period — "pichle 30 din" ke muqable "usse pehle ke 30 din" */
  const prev = useMemo(() => {
    if (!from || !to) return null;
    const a = new Date(`${from}T00:00:00`); const b = new Date(`${to}T00:00:00`);
    const len = Math.round((b - a) / 86400000) + 1;
    const pb = new Date(a); pb.setDate(pb.getDate() - 1);
    const pa = new Date(pb); pa.setDate(pa.getDate() - (len - 1));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    /* Pichle period ka poora data ho tabhi compare — warna "-100%" jaisa jhooth */
    if (coverage(data, iso(pa), iso(pb)) !== "full") return null;
    return { from: iso(pa), to: iso(pb), rows: picked.map((k) => aggregate(data, k, iso(pa), iso(pb))) };
  }, [data, picked, from, to]);
  const curCov = coverage(data, from, to);

  const get = useCallback((g, s) => {
    const i = picked.indexOf(g);
    if (s === "cur") return cur[i]?.t[chartMetric] || 0;
    return prev?.rows[i]?.[chartMetric] || 0;
  }, [cur, prev, picked, chartMetric]);

  const groups = cur.map(({ p }) => ({ key: p.key, label: p.label }));
  const series = [
    { key: "cur", label: "This period", color: "#7C6CFF" },
    ...(prev ? [{ key: "prev", label: `Previous period (${fmtDate(prev.from)} – ${fmtDate(prev.to)})`, color: "#5B6478" }] : []),
  ];

  return (
    <>
      <VerdictBoard rows={cur} range={range} from={from} to={to} />

      {/* platform cards */}
      <div className="cp-cards" style={{ gridTemplateColumns: `repeat(${Math.min(cur.length, 4)}, 1fr)` }}>
        {cur.map(({ p, t }, i) => {
          const pv = prev?.rows[i];
          const wins = ["results", "cpl", "convRate", "cpc"].filter((m) => winnerOf(cur.map((c) => c.t[m]), metricOf(m).better) === i);
          return (
            <div className="cp-card" key={p.key} style={{ "--c": p.color, "--s": p.soft }}>
              <div className="cp-card-h">
                <span className="cp-ic"><i className={p.icon} /></span>
                <b>{p.label}</b>
                {wins.length ? <span className="cp-crown"><i className="fa-solid fa-crown" /> {wins.length}</span> : null}
              </div>
              <div className="cp-big">{count(t.results)}<small> leads</small></div>
              <Delta cur={t.results} prev={pv?.results} better="high" />
              <div className="cp-kv">
                <div><span>Spend</span><b>{money2(t.spend)}</b></div>
                <div><span>Cost / lead</span><b>{t.cpl ? money2(t.cpl) : "—"}</b><Delta cur={t.cpl} prev={pv?.cpl} better="low" small /></div>
                <div><span>Converted</span><b>{count(t.converted)}</b></div>
                <div><span>Conversion</span><b>{FMT.pct(t.convRate)}</b></div>
                <div><span>Cost / conversion</span><b>{t.cpc ? money(t.cpc) : "—"}</b></div>
                <div><span>CTR (link)</span><b>{FMT.pct(t.ctr)}</b></div>
              </div>
              <div className="cp-bar"><i style={{ width: `${Math.min(100, t.convRate * 4)}%` }} /></div>
              <div className="cp-bar-l">Lead → Conversion {FMT.pct(t.convRate)}</div>
            </div>
          );
        })}
      </div>

      {/* 3D */}
      <div className="cp-panel">
        <div className="cp-panel-h">
          <div><b>Comparison graph</b><span>{prev ? "Each platform — this period vs the previous equal period" : "Each platform — no complete data for the previous period, so this period only"}</span></div>
          <div className="cp-ctl-r"><MetricPicker value={chartMetric} onChange={setChartMetric} /><ChartModeSwitch value={chartMode} onChange={setChartMode} /></div>
        </div>
        <Bars3D groups={groups} series={series} get={get} fmt={short(chartMetric)} title={metricOf(chartMetric).label} height={360} mode={chartMode} />
      </div>

      {/* poora comparison — sections me */}
      <div className="cp-panel ft-panel">
        <div className="cp-panel-h">
          <div><b>Full comparison</b><span>{range === "all" ? "All data" : `${fmtDate(from)} to ${fmtDate(to)}`} · best value in each row is marked
            {curCov === "partial" ? <span className="cp-tag part">data starts {fmtDate(data.adsFirst || data.leadsFirst)} — period is partial</span> : null}</span></div>
        </div>
        <div className="tbl-scroll">
          <table className="ft">
            <thead>
              <tr>
                <th className="ft-m">Metric</th>
                {cur.map(({ p, t }) => (
                  <th key={p.key} className="ft-p" style={{ "--pc": p.color }}>
                    <span className="ft-ph"><i />{p.label}</span>
                    <span className="ft-ps">{money(t.spend)} spent</span>
                  </th>
                ))}
              </tr>
            </thead>
            {FT_GROUPS.map((g) => (
              <tbody key={g.label}>
                <tr className="ft-g"><th colSpan={cur.length + 1}>{g.label}</th></tr>
                {g.keys.map((k) => {
                  const m = metricOf(k);
                  const vals = cur.map((c) => c.t[m.key]);
                  const win = winnerOf(vals, m.better);
                  const mx = Math.max(1e-9, ...vals);
                  return (
                    <tr key={m.key}>
                      <td className="ft-m">{m.label}{m.better !== "none" ? <em>{m.better === "low" ? "lower is better" : "higher is better"}</em> : null}</td>
                      {vals.map((v, i) => (
                        <td key={i} className={`ft-v${win === i ? " best" : ""}`} style={{ "--pc": cur[i].p.color }}>
                          <div className="ft-cell">
                            <b>{v ? FMT[m.fmt](v) : "—"}</b>
                            {win === i ? <span className="ft-best">Best</span> : null}
                          </div>
                          <span className="ft-bar"><i style={{ width: `${v ? Math.max(3, (v / mx) * 100) : 0}%` }} /></span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </>
  );
}

/* ================= 2 · Mahine vs Mahine ================= */
function MonthView({ data, picked, months, focus, setFocus, chartMetric, setChartMetric, chartMode, setChartMode }) {
  const grid = useMemo(() => {
    const g = {};
    picked.forEach((k) => { g[k] = months.map((mk) => { const [a, b] = monthRange(mk); return aggregate(data, k, a, b); }); });
    return g;
  }, [data, picked, months]);

  /* Har mahine ka data hai? none = pehle ka, partial = data beech se shuru */
  const cov = useMemo(() => months.map((mk) => { const [a, b] = monthRange(mk); return coverage(data, a, b); }), [data, months]);
  const isNone = (i) => cov[i] === "none";
  const groups = months.map((mk) => ({ key: mk, label: `${monthLabel(mk)}${isPartialMonth(mk) ? "*" : ""}` }));
  const series = picked.map((k) => { const p = platformOf(k); return { key: k, label: p.label, color: p.color }; });
  const get = useCallback((mk, k) => { const i = months.indexOf(mk); return isNone(i) ? 0 : grid[k]?.[i]?.[chartMetric] || 0; }, [grid, months, chartMetric, cov]);

  const fp = platformOf(focus || picked[0]);
  const rows = grid[fp.key] || [];

  /* Chalu mahina adhoora hai — use pichle mahine ke UTNE HI dinon se
     milao (Oct 1-3 vs Sep 1-3), warna har cheez -90% laal dikhti hai */
  const lastIdx = months.length - 1;
  const partial = lastIdx >= 0 && isPartialMonth(months[lastIdx]);
  const samePeriodPrev = useMemo(() => {
    if (!partial || lastIdx < 1) return null;
    const dayNo = new Date().getDate();
    const [a] = monthRange(months[lastIdx - 1]);
    const [, pEnd] = monthRange(months[lastIdx - 1]);
    const end = `${a.slice(0, 8)}${String(Math.min(dayNo, Number(pEnd.slice(8)))).padStart(2, "0")}`;
    return { label: `${monthLabel(months[lastIdx - 1])} 1-${Math.min(dayNo, Number(pEnd.slice(8)))}`, t: aggregate(data, fp.key, a, end) };
  }, [partial, lastIdx, months, data, fp.key]);

  /* "Sabse achha mahina" — jis mahine ka data nahi wo nahi; jod wale
     metric (spend, leads...) me adhoore mahine bhi nahi */
  const best = (m) => winnerOf(rows.map((r, i) => {
    if (cov[i] === "none") return 0;
    const incomplete = cov[i] === "partial" || (partial && i === lastIdx);
    return incomplete && !RATIO.includes(m.key) ? 0 : r[m.key];
  }), m.better);
  /* Badlaav tabhi jab dono mahine ka data poora ho */
  const prevFor = (i, key) => {
    if (i === 0 || cov[i] === "none" || cov[i - 1] !== "full") return undefined;
    if (partial && i === lastIdx) return samePeriodPrev ? samePeriodPrev.t[key] : undefined;
    if (cov[i] === "partial") return undefined;
    return rows[i - 1][key];
  };

  return (
    <>
      <VerdictTiles kind="month" title={`Best month, ${fp.label.replace(" (FB + IG)", "")}`}
        period={`${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`}
        need="Pick at least two months with data to compare."
        items={[
          { key: "results", q: "Most leads", note: "Leads from ads (Results)", better: "high", fmt: (v) => count(v) },
          { key: "cpl", q: "Cheapest lead", note: "Cost per lead, lower is better", better: "low", fmt: (v) => money2(v) },
          { key: "convRate", q: "Best conversion", note: "Panel leads that became orders", better: "high", fmt: (v) => FMT.pct(v) },
          { key: "converted", q: "Most orders", note: "Converted leads", better: "high", fmt: (v) => count(v) },
        ].map((it) => ({
          ...it,
          entries: months.map((mk, i) => ({
            key: mk, label: monthLabel(mk), color: fp.color, value: rows[i]?.[it.key] || 0,
            /* data nahi → bahar; adhoora mahina sirf ratio metric me */
            skip: cov[i] === "none" || ((cov[i] === "partial" || (partial && i === lastIdx)) && !RATIO.includes(it.key)),
          })),
        }))} />

      <div className="cp-panel">
        <div className="cp-panel-h">
          <div><b>Month × platform</b><span>One bar per platform per month · * = current (partial) month · — = no data for that month</span></div>
          <div className="cp-ctl-r"><MetricPicker value={chartMetric} onChange={setChartMetric} /><ChartModeSwitch value={chartMode} onChange={setChartMode} /></div>
        </div>
        <Bars3D groups={groups} series={series} get={get} fmt={short(chartMetric)} title={metricOf(chartMetric).label} height={380} mode={chartMode}
          missing={(mk) => isNone(months.indexOf(mk))} />
      </div>

      <div className="cp-panel">
        <div className="cp-panel-h"><div><b>Trend</b><span>{metricOf(chartMetric).label} — month-wise</span></div></div>
        <TrendLine labels={groups.map((g) => g.label)} fmt={short(chartMetric)}
          missingAt={isNone}
          lines={series.map((s) => ({ key: s.key, label: s.label, color: s.color, values: months.map((mk) => get(mk, s.key)) }))} />
      </div>

      <div className="cp-panel">
        <div className="cp-panel-h">
          <div><b>Month-wise table</b><span>Change vs previous month · green = best month{samePeriodPrev ? `· current month compared with ${samePeriodPrev.label}` : ""}</span></div>
          <div className="cp-seg">
            {picked.map((k) => { const p = platformOf(k); return (
              <button key={k} type="button" className={fp.key === k ? "on" : ""} onClick={() => setFocus(k)} style={fp.key === k ? { color: p.color } : null}>
                <i className={p.icon} /> {p.label}
              </button>
            ); })}
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="cp-tbl">
            <thead><tr><th>Metric</th>{months.map((mk, i) => (
              <th key={mk} className="ta-r">{monthLabel(mk)}
                {isPartialMonth(mk) ? <em> current</em> : null}
                {cov[i] === "none" ? <span className="cp-tag none">no data</span> : cov[i] === "partial" ? <span className="cp-tag part">adhoora</span> : null}
              </th>
            ))}</tr></thead>
            <tbody>
              {METRICS.map((m) => {
                const w = best(m);
                return (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    {rows.map((r, i) => (
                      <td key={months[i]} className={`ta-r${w === i ? " win" : ""}`}>
                        {cov[i] === "none" ? <span className="cp-nodata">—</span> : (
                          <>
                            <b>{r[m.key] ? FMT[m.fmt](r[m.key]) : "0"}</b>
                            <Delta cur={r[m.key]} prev={prevFor(i, m.key)} better={m.better} small />
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ================= 3 · Conversion Funnel ================= */
function FunnelView({ data, picked, from, to }) {
  const rows = useMemo(() => picked.map((k) => ({ p: platformOf(k), t: aggregate(data, k, from, to) })), [data, picked, from, to]);
  const fun = rows.map(({ p, t }) => ({
    key: p.key, label: p.label, color: p.color,
    stages: [
      { label: "Impressions", value: t.impressions },
      { label: "Link clicks", value: t.linkClicks },
      { label: "Leads (Ads)", value: t.results },
      { label: "Reached panel", value: t.panelLeads },
      { label: "Converted", value: t.converted },
    ],
  }));
  const steps = [
    { key: "ctr", label: "Impression → Click", better: "high" },
    { key: "clickToLead", label: "Click → Lead", better: "high" },
    { key: "captureRate", label: "Ad lead → Panel", better: "high" },
    { key: "convRate", label: "Panel lead → Converted", better: "high" },
  ];
  return (
    <>
      <VerdictTiles title="Funnel verdict" period={from && to ? `${fmtDate(from)} to ${fmtDate(to)}` : "All data"}
        need="Select at least two platforms above to compare each step."
        items={[
          { key: "ctr", q: "Best click rate", note: "Impressions that became link clicks", better: "high", fmt: (v) => FMT.pct(v) },
          { key: "clickToLead", q: "Best click to lead", note: "Link clicks that became leads", better: "high", fmt: (v) => FMT.pct(v) },
          { key: "captureRate", q: "Most leads reach panel", note: "Ad leads that reached Lead Capture", better: "high", fmt: (v) => FMT.pct(v) },
          { key: "convRate", q: "Best conversion", note: "Panel leads that became orders", better: "high", fmt: (v) => FMT.pct(v) },
        ].map((it) => ({
          ...it,
          entries: rows.map(({ p, t }) => ({ key: p.key, label: p.label.replace(" (FB + IG)", ""), color: p.color, value: t[it.key] || 0 })),
        }))} />

      <div className="cp-panel">
        <div className="cp-panel-h"><div><b>Conversion funnel</b><span>Top to bottom · % on the right = share carried from the previous step · width on log scale</span></div></div>
        <Funnel3D platforms={fun} fmt={(v) => short("results")(v)} height={380} />
        <div className="cp-flegend">
          {["Impressions", "Link clicks", "Leads (Ads)", "Reached panel", "Converted"].map((l, i) => (
            <span key={l}><em>{i + 1}</em>{l}{i < 4 ? <i className="fa-solid fa-chevron-right" /> : null}</span>
          ))}
        </div>
      </div>

      <div className="cp-steps">
        {steps.map((s) => {
          const vals = rows.map((r) => r.t[s.key]);
          const w = winnerOf(vals, s.better);
          return (
            <div className="cp-step" key={s.key}>
              <div className="cp-step-h">{s.label}</div>
              {rows.map(({ p, t }, i) => (
                <div className={`cp-step-r${w === i ? " win" : ""}`} key={p.key}>
                  <span><i style={{ background: p.color }} />{p.label}</span>
                  <div className="cp-step-bar"><i style={{ width: `${Math.min(100, (t[s.key] / Math.max(1e-9, ...vals)) * 100)}%`, background: p.color }} /></div>
                  <b>{FMT.pct(t[s.key])}</b>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="cp-panel">
        <div className="cp-panel-h"><div><b>Where the money got to</b><span>Cost of each step</span></div></div>
        <div className="tbl-scroll">
          <table className="cp-tbl">
            <thead><tr><th>Platform</th><th className="ta-r">Spend</th><th className="ta-r">Per 1,000 impressions</th><th className="ta-r">Per click</th><th className="ta-r">Per lead</th><th className="ta-r">Per conversion</th></tr></thead>
            <tbody>
              {rows.map(({ p, t }) => (
                <tr key={p.key}>
                  <td><span className="cp-th-dot" style={{ background: p.color }} />{p.label}</td>
                  <td className="ta-r"><b>{money2(t.spend)}</b></td>
                  <td className="ta-r">{t.impressions ? money2(t.cpm) : "—"}</td>
                  <td className="ta-r">{t.linkClicks ? money2(t.spend / t.linkClicks) : "—"}</td>
                  <td className="ta-r">{t.cpl ? money2(t.cpl) : "—"}</td>
                  <td className="ta-r"><b>{t.cpc ? money(t.cpc) : "—"}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ---------- chhote hisse ---------- */
function MetricPicker({ value, onChange }) {
  return (
    <div className="cp-seg">
      {CHART_METRICS.map((k) => (
        <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)}>{metricOf(k).label}</button>
      ))}
    </div>
  );
}

function ChartModeSwitch({ value, onChange }) {
  return (
    <div className="cp-mode3d" title="Chart style">
      <button type="button" className={value === "3d" ? "on" : ""} onClick={() => onChange("3d")}>3D</button>
      <button type="button" className={value === "2d" ? "on" : ""} onClick={() => onChange("2d")}>2D</button>
    </div>
  );
}

function Delta({ cur, prev, better, small }) {
  if (prev === undefined || prev === null) return null;
  if (!cur && !prev) return null;      /* dono 0 — badlaav ka matlab nahi */
  const d = delta(cur || 0, prev || 0);
  if (d === null) return <span className={`cp-delta new${small ? " sm" : ""}`}>new</span>;
  if (!Number.isFinite(d) || Math.abs(d) < 0.05) return <span className={`cp-delta flat${small ? " sm" : ""}`}>— 0%</span>;
  const up = d > 0;
  const good = better === "none" ? null : better === "low" ? !up : up;
  return (
    <span className={`cp-delta ${good === null ? "flat" : good ? "good" : "bad"}${small ? " sm" : ""}`}>
      <i className={`fa-solid ${up ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}`} /> {Math.abs(d).toFixed(Math.abs(d) >= 10 ? 0 : 1)}%
    </span>
  );
}

function HeroStat({ label, value }) {
  return <div className="cp-hs"><span>{label}</span><b>{value}</b></div>;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${String(y).slice(2)}`;
}
function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `Updated ${s} sec ago`;
  if (s < 3600) return `Updated ${Math.floor(s / 60)} min ago`;
  return `Updated ${Math.floor(s / 3600)} hours ago`;
}

/* ================= Verdict board =================
   Is page ki ek yaadgaar cheez. Har zaroori sawaal ki ek line —
   har platform ki bar, aur jo jeeta uspe notary jaisi mohar.
   Bar ki lambai = value (kam-behtar wale metric me bhi value hi,
   taaki padhne me ulta na lage). */
const VERDICTS = [
  { key: "cpl", q: "Cheapest lead", note: "Cost per lead, lower is better", better: "low", fmt: (v) => money2(v) },
  { key: "results", q: "Most leads", note: "Leads from ads (Results)", better: "high", fmt: (v) => count(v) },
  { key: "convRate", q: "Best conversion", note: "Panel leads that became orders", better: "high", fmt: (v) => FMT.pct(v) },
  { key: "cpc", q: "Cheapest order", note: "Cost per conversion, lower is better", better: "low", fmt: (v) => money(v) },
];

function VerdictBoard({ rows, range, from, to }) {
  const period = range === "all" ? "All data" : `${fmtDate(from)} to ${fmtDate(to)}`;
  const items = VERDICTS.map((v) => ({
    ...v,
    entries: rows.map((r) => ({ key: r.p.key, label: r.p.label.replace(" (FB + IG)", ""), color: r.p.color, value: r.t[v.key] || 0 })),
  }));
  return <VerdictTiles title="Verdict" period={period} items={items} need="Select at least two platforms above to see which one wins on each metric." />;
}

/* Ek jaisa verdict — platforms ke beech, mahino ke beech, funnel steps ke beech.
   items: [{ key, q, note, better, fmt, entries: [{ key, label, color, value, skip }] }] */
function VerdictTiles({ title, period, items, need, kind = "platform" }) {
  const enough = items.some((it) => it.entries.filter((e) => !e.skip).length >= 2);
  if (!enough) {
    return (
      <section className="vt-wrap vt-solo">
        <div className="vt-head"><h2>{title}</h2><span>{period}</span></div>
        <p>{need}</p>
      </section>
    );
  }
  return (
    <section className="vt-wrap" aria-label={title}>
      <div className="vt-head"><h2>{title}</h2><span>{period}</span></div>
      <div className="vt-grid">
        {items.map((v) => {
          const vals = v.entries.map((e) => (e.skip ? 0 : e.value || 0));
          const win = winnerOf(vals, v.better);
          const max = Math.max(...vals, 1e-9);
          const w = win >= 0 ? v.entries[win] : null;
          const order = v.entries.map((e, i) => ({ e, i, v: vals[i] }))
            .sort((x, y) => (!x.v) - (!y.v) || (v.better === "low" ? x.v - y.v : y.v - x.v))
            .slice(0, 6);
          return (
            <article className={`vt-tile${w ? "" : " vt-none"}`} key={v.key} style={w ? { "--pc": w.color } : null}>
              <div className="vt-q">{v.q}</div>
              {w ? (
                <>
                  <div className="vt-win">
                    <span className="vt-dot" />
                    <b>{w.label}</b>
                    <span className="vt-badge"><i className="fa-solid fa-trophy" /> {kind === "month" ? "Best month" : "Winner"}</span>
                  </div>
                  <div className="vt-val">{v.fmt(vals[win])}</div>
                  <div className="vt-note">{v.note}</div>
                </>
              ) : (
                <>
                  <div className="vt-win"><b>No clear winner</b></div>
                  <div className="vt-note">Values are tied or there is not enough data</div>
                </>
              )}
              <ol className="vt-rank">
                {order.map(({ e, i, v: val }) => (
                  <li key={e.key} className={i === win ? "on" : !val ? "nil" : ""} style={{ "--pc": e.color }}>
                    <span className="vt-rank-n"><i />{e.label}</span>
                    <span className="vt-rank-b"><i style={{ width: `${val ? Math.max(4, (val / max) * 100) : 0}%` }} /></span>
                    <span className="vt-rank-v">{val ? v.fmt(val) : "—"}</span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}
