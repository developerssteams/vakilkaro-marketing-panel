"use client";

/* ============================================================
   components/CampaignStates.js — ek campaign ki leads kis state se

   Campaigns → ⋯ → "Leads by state". Upar Meta ka state-wise data
   (kharch, form leads, chats, cost per lead), neeche Lead Capture me
   aayi is campaign ki leads ka state (form / city se).
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { leadState } from "../lib/india-states";
import { usePaged } from "./Pager";

const PERIODS = [["7", "Last 7 days", 6], ["30", "Last 30 days", 29], ["90", "Last 90 days", 89]];
const z = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const inr = (v, d = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: d, minimumFractionDigits: d }).format(Number(v) || 0);
const num = (v) => new Intl.NumberFormat("en-IN").format(Math.round(Number(v) || 0));

export default function CampaignStates({ campaign, onClose }) {
  const [period, setPeriod] = useState("30");
  const [st, setSt] = useState({ loading: true });

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const days = PERIODS.find((p) => p[0] === period)[2];
  const since = (() => { const d = new Date(); d.setDate(d.getDate() - days); return iso(d); })();
  const until = iso(new Date());

  useEffect(() => {
    let off = false;
    (async () => {
      setSt({ loading: true });
      const acc = String(campaign.accountId || "").trim();
      const ids = /^act_\d+$/.test(acc) ? [acc] : [...new Set(readRows("ad-accounts__accounts").filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
      try {
        const r = await fetch("/api/meta/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids, since, until }) });
        const j = await r.json().catch(() => ({}));
        if (off) return;
        if (!r.ok) setSt({ loading: false, error: j.error || "Could not load state-wise data" });
        else setSt({ loading: false, rows: (j.rows || []).filter((x) => String(x.campaignId) === String(campaign.extId)) });
      } catch { if (!off) setSt({ loading: false, error: "Could not reach the server" }); }
    })();
    return () => { off = true; };
  }, [period, campaign.extId]);

  const meta = useMemo(() => {
    const list = (st.rows || []).filter((r) => r.spend || r.leads || r.chats).sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    const tot = list.reduce((t, r) => ({ leads: t.leads + r.leads, chats: t.chats + r.chats, spend: t.spend + r.spend }), { leads: 0, chats: 0, spend: 0 });
    return { list, tot, max: Math.max(1, ...list.map((r) => r.leads)) };
  }, [st.rows]);

  /* Panel ki leads (Lead Capture) — isi campaign ki, isi period ki */
  const panel = useMemo(() => {
    const m = {};
    readRows("lead-capture__inbox-log").forEach((l) => {
      const d = String(l.receivedAt || "").slice(0, 10);
      if (d < since || d > until) return;
      if (String(l.campaign || "").toLowerCase() !== String(campaign.name || "").toLowerCase()) return;
      const s = leadState(l).state || "Not known";
      m[s] = (m[s] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => (a[0] === "Not known") - (b[0] === "Not known") || b[1] - a[1]);
  }, [campaign.name, since, until]);

  const pg = usePaged(meta.list, period);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal marketing-modal cs-modal" role="dialog" aria-label="Leads by state">
        <div className="modal-head">
          <div className="mt"><i className="fa-solid fa-map-location-dot" /> Leads by state</div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body cs-body">
          <div className="cs-top">
            <div className="cs-name"><b>{campaign.name}</b><span>{since} → {until}</span></div>
            <label className="st-sel"><i className="fa-regular fa-calendar" />
              <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <i className="fa-solid fa-chevron-down st-cv" />
            </label>
          </div>

          {st.loading ? <div className="ca-form-msg"><i className="fa-solid fa-spinner fa-spin" /> Loading state-wise data from Meta...</div>
            : st.error ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {st.error}</div>
            : (
              <>
                <div className="lf-stats cs-stats">
                  <div><span>Form leads</span><b>{num(meta.tot.leads)}</b></div>
                  <div><span>Chats</span><b>{num(meta.tot.chats)}</b></div>
                  <div><span>Spend</span><b>{inr(meta.tot.spend)}</b></div>
                  <div><span>Top state</span><b className="st-txt">{meta.list[0]?.leads ? meta.list[0].region : "—"}</b></div>
                </div>
                {meta.list.length ? (
                  <div className="tbl-scroll cs-tw">
                    <table className="mod-table st-t">
                      <thead><tr><th>State</th><th className="ta-r">Form leads</th><th>Share</th><th className="ta-r">Chats</th><th className="ta-r">Spend</th><th className="ta-r">Cost / lead</th></tr></thead>
                      <tbody>
                        {pg.rows.map((r) => (
                          <tr key={r.region}>
                            <td><b>{r.region}</b></td>
                            <td className="ta-r"><b>{num(r.leads)}</b></td>
                            <td><span className="st-bar"><i style={{ width: `${(r.leads / meta.max) * 100}%` }} /></span><small className="mut"> {meta.tot.leads ? ((r.leads / meta.tot.leads) * 100).toFixed(1) : 0}%</small></td>
                            <td className="ta-r">{num(r.chats)}</td>
                            <td className="ta-r">{inr(r.spend, 2)}</td>
                            <td className="ta-r">{r.leads ? inr(r.spend / r.leads, 2) : <span className="mut">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="lf-empty"><i className="fa-solid fa-map" /><b>No state data</b><span>This campaign had no spend in this period.</span></div>}
                {pg.pager}
              </>
            )}

          {panel.length ? (
            <div className="cs-panel">
              <b><i className="fa-solid fa-user-plus" /> Leads in Lead Capture from this campaign</b>
              <div className="lf-chips">
                {panel.map(([s, n]) => <span key={s} className="lf-chip"><i className="fa-solid fa-location-dot" /> {s === "Not known" ? "State not known" : s} <em>{n}</em></span>)}
              </div>
            </div>
          ) : null}
          <p className="st-note"><i className="fa-solid fa-circle-info" /> Table = Meta's state (where the person saw the ad). Chips = state from the lead form or worked out from the city.</p>
        </div>
      </div>
    </div>
  );
}
