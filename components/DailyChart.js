"use client";

/* ============================================================
   components/DailyChart.js — Campaigns → platform card → Daily

   Pehle har din ek moti row thi — 30 din = poora page. Ab:
     · ek chart: bars = roz ka kharch, line = results
     · hover pe us din ki poori detail
     · neeche "Day-wise table" — khulne wali, apni jagah me scroll
   ============================================================ */

import { usePaged } from "./Pager";
import { useEffect, useMemo, useRef, useState } from "react";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export default function DailyChart({ rows, color = "#1877F2", money, count, isMeta, today }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  const [hi, setHi] = useState(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  /* rows aate hain naya-pehle; chart purana-pehle */
  const data = useMemo(() => [...rows].sort((a, b) => (a.day < b.day ? -1 : 1)), [rows]);
  /* Day-wise table — naya din upar, 10 per page */
  const newestFirst = useMemo(() => [...data].reverse(), [data]);
  const pg = usePaged(newestFirst);
  const totals = useMemo(() => {
    const spend = data.reduce((s, r) => s + r.spend, 0);
    const leads = data.reduce((s, r) => s + r.leads, 0);
    const active = data.filter((r) => r.spend > 0);
    const best = active.filter((r) => r.leads > 0).sort((a, b) => a.spend / a.leads - b.spend / b.leads)[0];
    const peak = [...data].sort((a, b) => b.spend - a.spend)[0];
    return { spend, leads, avg: active.length ? spend / active.length : 0, best, peak };
  }, [data]);

  const H = 230; const P = { l: 58, r: 46, t: 16, b: 30 };
  const plotW = w - P.l - P.r; const plotH = H - P.t - P.b;
  const maxS = niceMax(Math.max(...data.map((r) => r.spend), 0));
  const maxL = niceMax(Math.max(...data.map((r) => r.leads), 0));
  const step = plotW / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(28, step * 0.62));
  const x = (i) => P.l + step * i + step / 2;
  const yS = (v) => P.t + plotH - (v / maxS) * plotH;
  const yL = (v) => P.t + plotH - (v / maxL) * plotH;
  const every = Math.ceil(data.length / Math.max(4, Math.floor(plotW / 64)));
  const line = data.map((r, i) => `${x(i).toFixed(1)},${yL(r.leads).toFixed(1)}`).join(" ");
  const h = hi !== null ? data[hi] : null;

  return (
    <div className="dc">
      <div className="dc-sum">
        <div><span>Total spend</span><b>{money(totals.spend)}</b></div>
        <div><span>{isMeta ? "Results" : "Leads"}</span><b>{count(totals.leads)}</b></div>
        <div><span>Average per active day</span><b>{money(totals.avg)}</b></div>
        <div><span>Cheapest day</span><b>{totals.best ? `${label(totals.best.day)} · ${money(totals.best.spend / totals.best.leads)}` : "—"}</b></div>
        <div><span>Highest spend</span><b>{totals.peak && totals.peak.spend ? `${label(totals.peak.day)} · ${money(totals.peak.spend)}` : "—"}</b></div>
      </div>

      <div className="dc-chart" ref={ref} onMouseLeave={() => setHi(null)}>
        <svg width={w} height={H} role="img" aria-label="Daily spend and results">
          <defs>
            <linearGradient id="dc-bar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.95" /><stop offset="100%" stopColor={color} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={P.l} x2={w - P.r} y1={yS(maxS * t)} y2={yS(maxS * t)} className={t ? "dc-gl" : "dc-gl base"} />
              <text x={P.l - 10} y={yS(maxS * t) + 4} textAnchor="end" className="dc-ax">{money(maxS * t).replace(".00", "")}</text>
              <text x={w - P.r + 8} y={yL(maxL * t) + 4} className="dc-ax dc-ax-r">{Math.round(maxL * t)}</text>
            </g>
          ))}
          {data.map((r, i) => {
            const bh = r.spend ? Math.max(2, (r.spend / maxS) * plotH) : 0;
            const on = hi === i;
            return (
              <g key={r.day} onMouseEnter={() => setHi(i)}>
                <rect x={x(i) - step / 2} y={P.t} width={step} height={plotH} fill={on ? "rgba(20,21,26,.04)" : "transparent"} />
                {bh ? <rect x={x(i) - bw / 2} y={yS(r.spend)} width={bw} height={bh} rx={Math.min(5, bw / 3)} fill={on ? color : "url(#dc-bar)"} className="dc-bar" /> : null}
                {/* aakhri label se chipke nahi — usse pehle wala chhod do */}
                {(i % every === 0 && data.length - 1 - i >= Math.ceil(every / 2)) || i === data.length - 1 ? (
                  <text x={x(i)} y={H - 10} textAnchor="middle" className={`dc-ax${r.day === today ? " dc-today" : ""}`}>{r.day === today ? "Today" : label(r.day)}</text>
                ) : null}
              </g>
            );
          })}
          <polyline points={line} fill="none" stroke="#14151A" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity=".75" pointerEvents="none" />
          {data.map((r, i) => (r.leads || hi === i ? <circle key={r.day} cx={x(i)} cy={yL(r.leads)} r={hi === i ? 4.5 : 2.6} fill="#fff" stroke="#14151A" strokeWidth="1.6" pointerEvents="none" /> : null))}
        </svg>

        {h ? (
          <div className="dc-tip" style={{ left: Math.min(Math.max(x(hi) - 90, 6), w - 196) }}>
            <b>{h.day === today ? `Today, ${label(h.day)}` : label(h.day)}</b>
            <div><span>Spend</span><em>{money(h.spend)}</em></div>
            <div><span>{isMeta ? "Results" : "Leads"}</span><em>{count(h.leads)}</em></div>
            <div><span>{isMeta ? "Cost per result" : "Cost per lead"}</span><em>{h.leads ? money(h.spend / h.leads) : "—"}</em></div>
            <div><span>Ads reporting</span><em>{count(h.ads)}</em></div>
          </div>
        ) : null}
      </div>
      <div className="dc-legend">
        <span><i style={{ background: color }} />Daily spend</span>
        <span><i className="ln" />{isMeta ? "Results" : "Leads"} (right axis)</span>
      </div>

      <details className="dc-tbl">
        <summary>Day-wise table <span>{data.length} days</span></summary>
        <div className="dc-tbl-scroll">
          <table>
            <thead><tr><th>Date</th><th className="ta-r">Spend</th><th className="ta-r">{isMeta ? "Results" : "Leads"}</th><th className="ta-r">{isMeta ? "Cost per result" : "Cost per lead"}</th><th className="ta-r">Ads</th></tr></thead>
            <tbody>
              {pg.rows.map((r) => (
                <tr key={r.day} className={!r.spend && !r.leads ? "nil" : ""}>
                  <td>{r.day === today ? <b>Today</b> : label(r.day)}</td>
                  <td className="ta-r">
                    <span className="dc-mini"><i style={{ width: `${maxS ? (r.spend / maxS) * 100 : 0}%`, background: color }} /></span>
                    {money(r.spend)}
                  </td>
                  <td className="ta-r">{count(r.leads)}</td>
                  <td className="ta-r">{r.leads ? money(r.spend / r.leads) : "—"}</td>
                  <td className="ta-r">{count(r.ads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pg.pager}
      </details>
    </div>
  );
}
