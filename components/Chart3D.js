"use client";

/* ============================================================
   components/Chart3D.js — comparison ke graph

   Halka 3D: bars me thodi gehraai aur roshni, par graph SEEDHA aur
   STHIR rehta hai — na apne aap ghoomta, na mouse se. Pehle wala
   ghoomne wala version padhne me mushkil tha, aur peeche ki bars
   aage wali ke peeche chhup jaati thi.

   Har bar ek line me agal-bagal (grouped) — koi bar kisi ke peeche
   nahi. Upar har bar ka number.

   Bars3D  — mode "3d" (halka 3D) ya "2d" (flat)
   Funnel3D — Impressions → Clicks → Leads → Converted
   TrendLine — mahine-wise line
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";

/* hex ya rgb() — dono */
function shade(color, amt) {
  let r; let g; let b;
  const m = String(color).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) { [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]; } else {
    const h = String(color).replace("#", "");
    const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const f = (x) => Math.max(0, Math.min(255, Math.round(x + amt * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* Data badalne pe bars neeche se uthein — ek baar, ghoomna nahi */
function useGrow(key) {
  const [k, setK] = useState(0);
  useEffect(() => { setK(0); const t = setTimeout(() => setK(1), 30); return () => clearTimeout(t); }, [key]);
  return k;
}

/* ================= Bars ================= */
/* SVG me 2.5D: har bar = aage ka chehra + upar ka chehra + daayi side.
   Koi rotation nahi — number, hover aur axis sab pixel-perfect aligned.
   mode "2d" me sirf aage ka chehra (flat). */
export function Bars3D({ groups, series, get, fmt, height = 340, title, emptyText = "No data for this selection", mode = "3d", missing }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const vals = useMemo(() => groups.map((g) => series.map((s) => {
    const v = Number(get(g.key, s.key));
    return Number.isFinite(v) && v > 0 ? v : 0;
  })), [groups, series, get]);
  const max = Math.max(0, ...vals.flat());
  const grow = useGrow(JSON.stringify(vals) + mode);

  if (!groups.length || !series.length || max <= 0) {
    return <div className="c3-stage c3-empty" style={{ height }} ref={ref}><i className="fa-solid fa-chart-column" /><span>{emptyText}</span></div>;
  }

  const W = width; const H = height;
  const padL = 62; const padR = 26; const padB = 40; const padT = title ? 44 : 22;
  const plotW = W - padL - padR; const plotH = H - padB - padT;
  const cellX = plotW / groups.length;
  const gapIn = Math.max(3, Math.min(8, cellX * 0.04));
  const bw = Math.max(7, Math.min(48, (cellX * 0.7 - gapIn * (series.length - 1)) / series.length));
  const groupW = bw * series.length + gapIn * (series.length - 1);
  /* gehraai — halki. dx daayein, dy upar */
  const dx = mode === "3d" ? Math.min(10, bw * 0.32) : 0;
  const dy = dx * 0.62;
  const nice = niceMax(max);
  const yOf = (v) => padT + plotH - (v / nice) * plotH;
  const showVals = groups.length * series.length <= 36;
  const x0 = (gi, si) => padL + cellX * gi + (cellX - groupW) / 2 + si * (bw + gapIn);

  return (
    <div className="c3-wrap">
      <div className={`c3-stage ${mode === "3d" ? "is3d" : "is2d"}`} style={{ height }} ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} className="c3-svg">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`bf-${s.key.replace(/\W/g, "")}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={shade(s.color, 0.12)} /><stop offset="100%" stopColor={s.color} />
              </linearGradient>
            ))}
          </defs>
          {title ? <text x={18} y={26} className="c3-svg-title">{title}</text> : null}

          {/* jaali */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={yOf(nice * t)} y2={yOf(nice * t)} className={t ? "c3-gl" : "c3-gl base"} />
              <text x={padL - 10} y={yOf(nice * t) + 4} textAnchor="end" className="c3-yl">{fmt(nice * t)}</text>
            </g>
          ))}

          {groups.map((g, gi) => (
            <g key={g.key}>
              {hover && hover.g === gi ? <rect x={padL + cellX * gi + 2} y={padT - 6} width={cellX - 4} height={plotH + 6} rx="10" className="c3-colhi" /> : null}
              {series.map((s, si) => {
                const v = vals[gi][si];
                const h = Math.max(v > 0 ? 2 : 0, (v / nice) * plotH) * grow;
                const x = x0(gi, si); const y = padT + plotH - h;
                const on = hover && hover.g === gi && hover.s === si;
                const c = on ? shade(s.color, 0.08) : s.color;
                const miss = missing && missing(g.key, s.key);
                return (
                  <g key={s.key} onMouseEnter={() => setHover({ g: gi, s: si })}>
                    <rect x={x - 2} y={padT} width={bw + dx + 4} height={plotH} fill="transparent" />
                    {miss ? (
                      <text x={x + bw / 2} y={padT + plotH - 8} textAnchor="middle" className="c3-miss">—</text>
                    ) : h > 0 ? (
                      <>
                        {dx ? <polygon points={`${x + bw},${y} ${x + bw + dx},${y - dy} ${x + bw + dx},${padT + plotH - dy} ${x + bw},${padT + plotH}`} fill={shade(c, -0.16)} /> : null}
                        <rect x={x} y={y} width={bw} height={h} fill={on ? c : `url(#bf-${s.key.replace(/\W/g, "")})`} rx={dx ? 0 : 4} className="c3-bar" />
                        {dx ? <polygon points={`${x},${y} ${x + dx},${y - dy} ${x + bw + dx},${y - dy} ${x + bw},${y}`} fill={shade(c, 0.22)} /> : null}
                        {(showVals || on) ? <text x={x + bw / 2 + dx / 2} y={y - dy - 7} textAnchor="middle" className={`c3-v${on ? " on" : ""}`}>{fmt(v)}</text> : null}
                      </>
                    ) : null}
                  </g>
                );
              })}
              <text x={padL + cellX * gi + cellX / 2} y={H - 14} textAnchor="middle" className="c3-xlbl">{g.label}</text>
            </g>
          ))}
        </svg>

        {hover ? (() => {
          const v = vals[hover.g][hover.s];
          const miss = missing && missing(groups[hover.g].key, series[hover.s].key);
          const left = Math.min(x0(hover.g, hover.s) + bw + 16, W - 210);
          return (
            <div className="c3-tip" style={{ left, top: Math.max(8, Math.min(yOf(v) - 20, H - 80)) }}>
              <i style={{ background: series[hover.s].color }} />
              <div><b>{groups[hover.g].label} · {series[hover.s].label}</b><span>{miss ? "No data" : fmt(v)}</span></div>
            </div>
          );
        })() : null}
      </div>
      <div className="c3-legend">
        {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}

/* Axis ka upar wala number gol — 1,000 / 2,500 / 50,000 */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * p;
}

/* ================= Funnel ================= */
/* platforms: [{ key, label, color, stages: [{ label, value }] }]
   Sthir, seedha. Har stage ek parat — upar chaudi, neeche patli. */
export function Funnel3D({ platforms, height = 360, fmt }) {
  const [hover, setHover] = useState(null);
  const grow = useGrow(JSON.stringify(platforms.map((p) => p.stages.map((s) => s.value))));

  if (!platforms.length) return <div className="c3-stage c3-empty" style={{ height }}><i className="fa-solid fa-filter" /><span>Select a platform</span></div>;

  const n = platforms[0].stages.length;
  const slabH = Math.min(58, (height - 90) / n - 8);
  const maxW = 180; const minW = 22;
  /* chaudai log scale pe — impressions lakhon me, converted das me */
  const widthOf = (v, top) => {
    if (!v || !top) return minW;
    const r = Math.log10(v + 1) / Math.log10(top + 1);
    return minW + (maxW - minW) * Math.max(0, r) ** 1.5;
  };

  return (
    <div className="c3-wrap">
      <div className="c3-stage is3d c3-fun" style={{ height }}>
        <div className="fn-row">
          {platforms.map((p, pi) => {
            const top = p.stages[0]?.value || 0;
            return (
              <div className="fn-col" key={p.key}>
                <div className="fn-stack">
                  {p.stages.map((st, si) => {
                    const w = widthOf(st.value, top) * (grow ? 1 : 0.3);
                    const col = shade(p.color, 0.16 - si * 0.1);
                    const on = hover && hover.p === pi && hover.s === si;
                    const prev = si ? p.stages[si - 1].value : 0;
                    return (
                      <div key={st.label} className={`fn-slab${on ? " on" : ""}`} style={{ height: slabH, width: w }}
                        onMouseEnter={() => setHover({ p: pi, s: si })} onMouseLeave={() => setHover(null)}>
                        <i className="fn-front" style={{ background: `linear-gradient(180deg, ${shade(col, 0.08)}, ${col})` }} />
                        <i className="fn-top" style={{ background: shade(col, 0.22) }} />
                        <i className="fn-side" style={{ background: shade(col, -0.14) }} />
                        <b>{fmt(st.value)}</b>
                        {si && prev ? <em>{((st.value / prev) * 100).toFixed(st.value / prev >= 0.1 ? 1 : 2)}%</em> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="fn-label" style={{ color: p.color }}>{p.label}</div>
              </div>
            );
          })}
        </div>
        {hover ? (
          <div className="c3-tip fixed">
            <i style={{ background: platforms[hover.p].color }} />
            <div><b>{platforms[hover.p].label} · {platforms[hover.p].stages[hover.s].label}</b>
              <span>{fmt(platforms[hover.p].stages[hover.s].value)}</span></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ================= TrendLine (2D) ================= */
export function TrendLine({ labels, lines, fmt, height = 220, missingAt }) {
  const W = 760; const H = height; const P = { l: 56, r: 18, t: 18, b: 30 };
  const all = lines.flatMap((l) => l.values);
  const max = niceMax(Math.max(0, ...all));
  const xs = (i) => P.l + (labels.length <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (labels.length - 1));
  const ys = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  const [hi, setHi] = useState(null);
  /* jis mahine ka data nahi, wahan line toot jaaye — 0 pe na gire */
  const segs = (vals) => {
    const out = []; let cur = [];
    vals.forEach((v, i) => {
      if (missingAt && missingAt(i)) { if (cur.length) out.push(cur); cur = []; return; }
      cur.push([xs(i), ys(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  return (
    <div className="tl-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="tl-svg" onMouseLeave={() => setHi(null)}>
        <defs>
          {lines.map((l) => (
            <linearGradient key={l.key} id={`tlg-${l.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={l.color} stopOpacity="0.22" /><stop offset="100%" stopColor={l.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={ys(max * t)} y2={ys(max * t)} className="tl-grid" />
            <text x={P.l - 8} y={ys(max * t) + 4} className="tl-ax" textAnchor="end">{fmt(max * t)}</text>
          </g>
        ))}
        {labels.map((lb, i) => <text key={lb} x={xs(i)} y={H - 8} className="tl-ax" textAnchor="middle">{lb}</text>)}
        {lines.map((l) => segs(l.values).map((seg, k) => {
          const pts = seg.map((p) => p.join(",")).join(" ");
          const area = `${seg[0][0]},${ys(0)} ${pts} ${seg[seg.length - 1][0]},${ys(0)}`;
          return (
            <g key={`${l.key}-${k}`}>
              <polygon points={area} fill={`url(#tlg-${l.key})`} />
              <polyline points={pts} fill="none" stroke={l.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              {seg.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke={l.color} strokeWidth="2.2" />)}
            </g>
          );
        }))}
        {labels.map((lb, i) => (
          <rect key={`h-${lb}`} x={xs(i) - (W / labels.length) / 2} y={0} width={W / labels.length} height={H} fill="transparent" onMouseEnter={() => setHi(i)} />
        ))}
        {hi !== null ? <line x1={xs(hi)} x2={xs(hi)} y1={P.t} y2={H - P.b} className="tl-cursor" /> : null}
      </svg>
      {hi !== null ? (
        <div className="tl-tip" style={{ left: `${(xs(hi) / W) * 100}%` }}>
          <b>{labels[hi]}</b>
          {missingAt && missingAt(hi)
            ? <div>No data for this month</div>
            : lines.map((l) => <div key={l.key}><i style={{ background: l.color }} />{l.label}<span>{fmt(l.values[hi])}</span></div>)}
        </div>
      ) : null}
    </div>
  );
}
