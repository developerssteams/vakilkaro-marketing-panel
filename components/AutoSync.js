"use client";

/* ============================================================
   components/AutoSync.js  —  topbar ka "Live" badge

   Panel ke kisi bhi page pe khula ho, ye har kuch minute me Meta
   se taaza data le aata hai. Button dabane ki zaroorat nahi.

   Kab chalta hai:
     · page khulte hi, agar aakhri sync purana hai
     · har 30 sec check — interval poora hua to sync
     · tab wapas dekhne pe (doosre tab se laut ke)
   Tab chhupa ho (minimize / doosra tab) to nahi chalta — koi dekh
   hi nahi raha to Meta ka quota kyun khaayein.

   Click karo to: on/off, kitni der me, abhi sync karo.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { autoPullExtras } from "../lib/meta-pull";
import { autoSyncNow, readSyncState, readAutoPref, saveAutoPref, isStale, INTERVALS, accountProblems, backoffLeft } from "../lib/sync-merge";

function ago(iso) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}

export default function AutoSync() {
  const [ready, setReady] = useState(null);       // Meta token hai?
  const [pref, setPref] = useState({ enabled: true, minutes: 5 });
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [problems, setProblems] = useState([]);
  const [, tick] = useState(0);
  const busyRef = useRef(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setPref(readAutoPref());
    setState(readSyncState());
    setProblems(accountProblems());
    fetch("/api/sync/status").then((r) => r.json())
      .then((d) => setReady(Boolean(d?.platforms?.meta?.ready)))
      .catch(() => setReady(false));

    const onState = () => { setState(readSyncState()); setProblems(accountProblems()); };
    window.addEventListener("vk-meta-sync-state", onState);
    window.addEventListener("vk-marketing-updated", onState);
    return () => {
      window.removeEventListener("vk-meta-sync-state", onState);
      window.removeEventListener("vk-marketing-updated", onState);
    };
  }, []);

  async function run(force) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const r = await autoSyncNow({ force });
      /* campaigns ke baad leads (har 15 min) aur payments (din me ek baar) */
      if (!r.skipped) await autoPullExtras().catch(() => {});
      if (r.skipped === "no-accounts" && force) {
        setState({ at: null, ok: false, error: "No Meta account connected — Ad Accounts → Connect Meta Account" });
      }
    } catch (e) {
      setState((s) => ({ ...(s || {}), ok: false, error: "Could not reach the server" }));
    } finally {
      busyRef.current = false; setBusy(false);
      setState(readSyncState()); setProblems(accountProblems());
    }
  }

  /* Timer — har second: "x sec pehle" aur countdown chalta rahe, aur
     interval poora hote hi (tab dikh raha ho to) sync */
  useEffect(() => {
    if (!ready || !pref.enabled) return undefined;
    const check = () => {
      tick((n) => n + 1);
      if (document.visibilityState !== "visible") return;
      if (backoffLeft() > 0) return;
      if (isStale(pref.minutes)) run(false);
    };
    check();
    const t = setInterval(check, 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [ready, pref.enabled, pref.minutes]);

  /* Bahar click → popover band */
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!ready) return null;

  function changePref(p) {
    const next = { ...pref, ...p };
    setPref(next); saveAutoPref(next);
  }

  const failed = state && state.ok === false && state.error;
  const wait = backoffLeft();
  const nextIn = state?.at ? Math.max(0, Math.round((Date.parse(state.at) + pref.minutes * 60000 - Date.now()) / 1000)) : 0;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const tone = busy ? "busy" : failed ? "bad" : wait ? "warn" : problems.length ? "warn" : !pref.enabled ? "off" : "ok";
  const label = busy ? "Syncing"
    : failed ? "Sync fail"
    : wait ? `Meta limit · wait ${Math.ceil(wait / 60000)} min`
    : !pref.enabled ? `Auto off · ${ago(state?.at)}`
    : !state?.at ? "Live · waiting for first sync"
    : `Live · ${ago(state?.at)} · next ${mmss(nextIn)}`;

  return (
    <div className="as-wrap" ref={wrapRef}>
      <button type="button" className={`as-pill as-${tone}`} onClick={() => setOpen((v) => !v)} title="When Meta data last arrived">
        {busy ? <i className="fa-solid fa-arrows-rotate fa-spin" /> : <span className="as-dot" />}
        <span className="as-txt">{label}</span>
      </button>

      {open ? (
        <div className="as-pop">
          <div className="as-pop-h"><i className="fa-brands fa-meta" /> Meta auto-sync</div>

          {problems.map((p) => (
            <div className="as-alert" key={p.accountId}>
              <i className="fa-solid fa-triangle-exclamation" />
              <span><b>{p.name}</b>: {p.problem}</span>
            </div>
          ))}

          {failed ? <div className="as-alert"><i className="fa-solid fa-circle-xmark" /><span>{state.error}</span></div> : null}
          {wait ? <div className="as-alert"><i className="fa-solid fa-hourglass-half" /><span>Meta API limit is {state?.usagePct || 0}% used — to avoid the token being blocked, sync will resume in {Math.ceil(wait / 60000)} min.</span></div> : null}

          <div className="as-row">
            <span>Meta API limit use</span>
            <b>{state?.usagePct ?? 0}%</b>
          </div>

          <div className="as-row">
            <span>Last sync</span>
            <b>{ago(state?.at)}{state?.since ? <em> · {state.since} → {state.until}</em> : null}</b>
          </div>

          <label className="as-row as-toggle">
            <span>Sync automatically</span>
            <input type="checkbox" checked={pref.enabled} onChange={(e) => changePref({ enabled: e.target.checked })} />
          </label>

          <div className="as-row">
            <span>Har</span>
            <select className="form-control mini-select" value={pref.minutes} disabled={!pref.enabled}
              onChange={(e) => changePref({ minutes: Number(e.target.value) })}>
              {INTERVALS.map((m) => <option key={m} value={m}>{m} minute</option>)}
            </select>
          </div>

          <button type="button" className="btn btn-gold as-now" disabled={busy} onClick={() => run(true)}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Sync now
          </button>

          <div className="as-note">
            Every minute: yesterday + today. Every 15 min: last 8 days. Once a day: last 30 days (Meta keeps adjusting Results for up to 7 days). Not every second — that would hit Meta's limit and block the token. Meta itself runs 15-30 min behind, so today's numbers will lag exactly as much as Ads Manager does.
          </div>
        </div>
      ) : null}
    </div>
  );
}
