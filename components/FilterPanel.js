"use client";

/* ============================================================
   components/FilterPanel.js
   Filter icon → form panel. Date range, platform, status aur objective
   ek hi jagah. Apply dabane tak numbers nahi badalte, taaki
   har click par table jhatke na khaaye.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { RANGES } from "../lib/date-range";
import { OBJECTIVES } from "../lib/objectives";
import { DEFAULT_FILTERS, FILTER_PLATFORMS, FILTER_STATUSES, activeCount, filterSummary, normalizeFilters, timeWindow, filterRangeLabel } from "../lib/filters";

export { DEFAULT_FILTERS };

export default function FilterPanel({ value, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const wrapRef = useRef(null);

  /* Panel kholte waqt draft ko current filters se sync karo, warna
     pichli baar ki adhuri selection dikhne lagegi. */
  useEffect(() => { if (open) setDraft(value); }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const n = activeCount(value);

  function set(patch) { setDraft((p) => ({ ...p, ...patch })); }

  /* Custom me time bhara ho to check — "From" "To" se pehle hona chahiye */
  const nd = normalizeFilters(draft);
  const win = timeWindow(nd);
  const badTime = Boolean(win && win.fromMs >= win.toMs);

  function apply() {
    if (badTime) return;
    onApply(nd);
    setOpen(false);
  }

  const todayStr = (() => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; })();

  function clearAll() {
    setDraft(DEFAULT_FILTERS);
    onApply(DEFAULT_FILTERS);
    setOpen(false);
  }

  return (
    <div className="fp-wrap" ref={wrapRef}>
      <button type="button" className={`fp-btn${n ? " on" : ""}${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <i className="fa-solid fa-filter" />
        <span>Filters</span>
        {n ? <span className="fp-badge">{n}</span> : null}
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"} fp-caret`} />
      </button>

      <span className="fp-summary"><i className="fa-solid fa-circle-check" /> {filterSummary(value)}</span>

      {open ? (
        <div className="fp-panel">
          <div className="fp-head">
            <div className="fp-title"><i className="fa-solid fa-filter" /> Filters</div>
            <button type="button" className="fp-x" onClick={() => setOpen(false)} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          </div>

          <div className="fp-body">
            <div className="fp-group">
              <div className="fp-label">Date range</div>
              <div className="fp-opts">
                {RANGES.map((r) => (
                  <button key={r.key} type="button" className={`fp-opt${draft.range === r.key ? " on" : ""}`} onClick={() => set({ range: r.key })}>
                    {draft.range === r.key ? <i className="fa-solid fa-check" /> : null}{r.label}
                  </button>
                ))}
              </div>
              {draft.range === "custom" ? (
                <>
                  <div className="fp-dates" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <label><span>From date</span><input type="date" className="form-control" value={draft.from || ""} max={draft.to || todayStr} onChange={(e) => set({ from: e.target.value })} /></label>
                    <label><span>From time</span><input type="time" className="form-control" value={draft.fromTime || ""} onChange={(e) => set({ fromTime: e.target.value })} /></label>
                    <label><span>To date</span><input type="date" className="form-control" value={draft.to || ""} min={draft.from || undefined} max={todayStr} onChange={(e) => set({ to: e.target.value })} /></label>
                    <label><span>To time</span><input type="time" className="form-control" value={draft.toTime || ""} onChange={(e) => set({ toTime: e.target.value })} /></label>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <button type="button" className={`fp-opt${draft.to === todayStr && !draft.toTime ? " on" : ""}`} onClick={() => set({ to: todayStr, toTime: "" })}>
                      {draft.to === todayStr && !draft.toTime ? <i className="fa-solid fa-check" /> : null}To: till now
                    </button>
                    {draft.fromTime || draft.toTime ? (
                      <button type="button" className="fp-opt" onClick={() => set({ fromTime: "", toTime: "" })}><i className="fa-solid fa-xmark" /> Clear time</button>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: badTime ? "#B42318" : "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>
                    {badTime
                      ? <><i className="fa-solid fa-triangle-exclamation" /> &quot;From&quot; has to be before &quot;To&quot;.</>
                      : win
                        ? <><i className="fa-regular fa-clock" /> {filterRangeLabel(nd)} · Meta gives data hour by hour, so the hour you pick is counted in full.</>
                        : <>Leave time empty for whole days. Leave &quot;To time&quot; empty to count till the end of that day (till now, if it is today).</>}
                  </div>
                </>
              ) : null}
            </div>

            <div className="fp-group">
              <div className="fp-label">Platform</div>
              <div className="fp-opts">
                <button type="button" className={`fp-opt${!draft.platform ? " on" : ""}`} onClick={() => set({ platform: "" })}>
                  {!draft.platform ? <i className="fa-solid fa-check" /> : null}All Platforms
                </button>
                {FILTER_PLATFORMS.map((p) => (
                  <button key={p} type="button" className={`fp-opt${draft.platform === p ? " on" : ""}`} onClick={() => set({ platform: p })}>
                    {draft.platform === p ? <i className="fa-solid fa-check" /> : null}{p}
                  </button>
                ))}
              </div>
            </div>

            <div className="fp-group">
              <div className="fp-label">Status</div>
              <div className="fp-opts">
                <button type="button" className={`fp-opt${!draft.status ? " on" : ""}`} onClick={() => set({ status: "" })}>
                  {!draft.status ? <i className="fa-solid fa-check" /> : null}All Status
                </button>
                {FILTER_STATUSES.map((st) => (
                  <button key={st} type="button" className={`fp-opt${draft.status === st ? " on" : ""}`} onClick={() => set({ status: st })}>
                    {draft.status === st ? <i className="fa-solid fa-check" /> : null}{st}
                  </button>
                ))}
              </div>
            </div>

            <div className="fp-group">
              <div className="fp-label">Objective</div>
              <div className="fp-opts">
                <button type="button" className={`fp-opt${!draft.objective ? " on" : ""}`} onClick={() => set({ objective: "" })}>
                  {!draft.objective ? <i className="fa-solid fa-check" /> : null}All Objectives
                </button>
                {OBJECTIVES.map((o) => (
                  <button key={o.key} type="button" className={`fp-opt${draft.objective === o.key ? " on" : ""}`} onClick={() => set({ objective: o.key })}>
                    {draft.objective === o.key ? <i className="fa-solid fa-check" /> : null}{o.key}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="fp-foot">
            <button type="button" className="btn btn-ghost" onClick={clearAll}><i className="fa-solid fa-rotate-left" /> Clear</button>
            <button type="button" className="btn btn-gold" onClick={apply} disabled={badTime}><i className="fa-solid fa-check" /> Apply</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}