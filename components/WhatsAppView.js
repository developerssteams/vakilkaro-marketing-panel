"use client";

/* ============================================================
   components/WhatsAppView.js — Campaigns → WhatsApp card

   Click-to-WhatsApp ads ka poora hisaab:
     · Meta se: WhatsApp ad sets pe kitna kharcha, kitni chats shuru
       hui (ad set ka destination WHATSAPP ho tabhi gina jaata hai)
     · Panel se: WhatsApp se kitni nayi leads aayi (whatsapp-ai app ke
       database se — ek naya number = ek lead)
   Campaign-wise milaan + leads ki list (WhatsApp pe seedha message).
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { inRange, rangeLabel } from "../lib/date-range";
import { waLeadsState } from "../lib/meta-pull";
import { money, money2, count } from "./ModuleParts";

const WA = "#25D366";
const PER = 10;

/* Ek jagah WhatsApp ka hisaab — card aur view dono yahi use karte hain */
export function whatsappStats(dailyInRange, from, to, inbox = []) {
  const t = { chats: 0, spend: 0, allChats: 0, leads: 0, adLeads: 0, directLeads: 0, camps: {} };
  dailyInRange.forEach((d) => {
    const c = Number(d.waChats || 0); const s = Number(d.waSpend || 0);
    t.allChats += Number(d.chats || 0);
    if (!c && !s) return;
    t.chats += c; t.spend += s;
    const k = d.campaign || "Unnamed";
    t.camps[k] = t.camps[k] || { name: k, chats: 0, spend: 0, leads: 0 };
    t.camps[k].chats += c; t.camps[k].spend += s;
  });
  const leads = inbox.filter((r) => String(r.source || "").startsWith("WhatsApp")
    && inRange(String(r.receivedAt || r.createdAt || "").slice(0, 10), from, to));
  leads.forEach((r) => {
    t.leads += 1;
    if (r.source === "WhatsApp Ad") {
      t.adLeads += 1;
      const k = r.campaign || "";
      if (k) { t.camps[k] = t.camps[k] || { name: k, chats: 0, spend: 0, leads: 0 }; t.camps[k].leads += 1; }
    } else t.directLeads += 1;
  });
  t.spend = Math.round(t.spend * 100) / 100;
  t.list = leads.sort((a, b) => String(b.receivedTime || b.receivedAt || "").localeCompare(String(a.receivedTime || a.receivedAt || "")));
  t.campList = Object.values(t.camps).sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  return t;
}

export default function WhatsAppView({ dailyInRange, range, from, to, onBack, filterPanel }) {
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  /* localStorage sirf browser me — effect me padhte hain (server render se mismatch na ho) */
  const [inbox, setInbox] = useState([]);
  const [st, setSt] = useState(undefined);   // undefined = abhi padha nahi
  useEffect(() => {
    const r = () => { setInbox(readRows("lead-capture__inbox-log")); setSt(waLeadsState()); setTick((x) => x + 1); };
    r();
    window.addEventListener("vk-marketing-updated", r);
    return () => window.removeEventListener("vk-marketing-updated", r);
  }, []);
  const s = useMemo(() => whatsappStats(dailyInRange, from, to, inbox), [dailyInRange, from, to, inbox, tick]);
  const cpc = s.chats ? s.spend / s.chats : 0;
  const cpl = s.adLeads ? s.spend / s.adLeads : 0;

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? s.list.filter((r) => [r.name, r.phone, r.campaign].some((v) => String(v || "").toLowerCase().includes(k))) : s.list;
  }, [s.list, q]);
  useEffect(() => { setPage(1); }, [q, from, to]);
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const rows = shown.slice((page - 1) * PER, page * PER);

  return (
    <div className="wa-view">
      <div className="wa-head">
        <button type="button" className="btn btn-ghost" onClick={onBack}><i className="fa-solid fa-arrow-left" /> All platforms</button>
        <div className="wa-title">
          <span className="wa-logo"><i className="fa-brands fa-whatsapp" /></span>
          <div><b>WhatsApp</b><span>Click-to-WhatsApp ads · {rangeLabel(range, from, to)}</span></div>
        </div>
      </div>
      {filterPanel}

      {st !== undefined && !st?.configured ? (
        <div className="wa-note">
          <i className="fa-solid fa-plug-circle-exclamation" />
          <div>
            <b>WhatsApp leads are not connected yet</b>
            <span>Chats and spend below come from Meta. To also list every person who messaged, add <code>WA_DATABASE_URL</code> in .env.local (the WhatsApp bot database) and restart. Leads then arrive here automatically every 15 minutes.</span>
          </div>
        </div>
      ) : st?.error ? (
        <div className="wa-note bad"><i className="fa-solid fa-triangle-exclamation" /><div><b>Could not read WhatsApp leads</b><span>{st.error}</span></div></div>
      ) : null}

      <div className="wa-kpis">
        <div className="wa-kpi"><span>Spent on WhatsApp ads</span><b>{money2(s.spend)}</b><small>Ad sets that open WhatsApp</small></div>
        <div className="wa-kpi"><span>Chats started</span><b>{count(s.chats)}</b><small>Meta · conversations started</small></div>
        <div className="wa-kpi"><span>Cost per chat</span><b>{cpc ? money2(cpc) : "—"}</b><small>Spend ÷ chats</small></div>
        <div className="wa-kpi hl"><span>New WhatsApp leads</span><b>{count(s.leads)}</b><small>{count(s.adLeads)} from ads · {count(s.directLeads)} direct</small></div>
        <div className="wa-kpi"><span>Cost per new lead</span><b>{cpl ? money2(cpl) : "—"}</b><small>Spend ÷ leads from ads</small></div>
      </div>
      {!s.chats && s.allChats > 0 ? (
        <div className="wa-note">
          <i className="fa-solid fa-hourglass-half" />
          <div>
            <b>No WhatsApp ad sets found in this range yet</b>
            <span>Meta has {count(s.allChats)} chats here, but none from an ad set that opens WhatsApp. After this update the panel re-downloads 90 days of Meta data once (1–2 minutes) — press Sync Meta, then come back. If it stays 0, your chat ads open Messenger / Instagram Direct, not WhatsApp.</span>
          </div>
        </div>
      ) : null}
      <p className="wa-explain">
        <i className="fa-solid fa-circle-info" /> A chat is counted every time a conversation starts (the same person can start more than one).
        A lead is one new phone number — so leads are usually a little lower than chats.
        {s.allChats > s.chats ? <> The other {count(s.allChats - s.chats)} chats in this range came from Messenger / Instagram Direct ads, which do not share phone numbers.</> : null}
      </p>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-bullhorn" /> &nbsp;Campaign-wise</div><div className="card-tools"><span className="cnt">{s.campList.length} campaigns</span></div></div>
        {s.campList.length ? (
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>Campaign</th><th>Spent</th><th>Chats</th><th>Cost / chat</th><th>New leads in panel</th></tr></thead>
              <tbody>{s.campList.map((c) => (
                <tr key={c.name}>
                  <td><b>{c.name}</b></td>
                  <td>{c.spend ? money2(c.spend) : <span className="mut">—</span>}</td>
                  <td>{c.chats ? count(c.chats) : <span className="mut">—</span>}</td>
                  <td>{c.chats ? money2(c.spend / c.chats) : <span className="mut">—</span>}</td>
                  <td><b>{count(c.leads)}</b></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="wa-empty"><i className="fa-brands fa-whatsapp" /><p>No Click-to-WhatsApp ads ran in this range.</p></div>}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className="fa-solid fa-user-plus" /> &nbsp;WhatsApp leads</div>
          <div className="card-tools">
            <label className="wa-search"><i className="fa-solid fa-magnifying-glass" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or campaign" aria-label="Search WhatsApp leads" /></label>
            <span className="cnt">{count(shown.length)}</span>
          </div>
        </div>
        {rows.length ? (
          <>
            <div className="tbl-scroll">
              <table className="mod-table">
                <thead><tr><th>Name</th><th>Phone</th><th>Came from</th><th>First message</th><th>When</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name || "—"}</b></td>
                    <td>{r.phone ? <a className="wa-phone" href={`https://wa.me/91${String(r.phone).slice(-10)}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> {r.phone}</a> : "—"}</td>
                    <td>{r.source === "WhatsApp Ad" ? <><span className="pill pill-active"><span className="dot">●</span>Ad</span> {r.campaign || ""}</> : <span className="pill pill-default">Direct</span>}</td>
                    <td className="wa-msg" title={r.message || ""}>{r.message || <span className="mut">—</span>}</td>
                    <td>{when(r)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="pgr">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><i className="fa-solid fa-chevron-left" /></button>
                <span>Page {page} of {pages}</span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><i className="fa-solid fa-chevron-right" /></button>
              </div>
            ) : null}
          </>
        ) : <div className="wa-empty"><i className="fa-solid fa-inbox" /><p>{st?.configured ? "No new WhatsApp leads in this range." : "Connect WhatsApp leads (see the note above) to list people here."}</p></div>}
      </div>
    </div>
  );
}

function when(r) {
  const t = r.receivedTime ? new Date(String(r.receivedTime).replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : null;
  if (t && !Number.isNaN(t.getTime())) return t.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return r.receivedAt || "—";
}

/* Cards grid ka WhatsApp card */
export function WhatsAppCard({ s, label, onOpen }) {
  const cpc = s.chats ? s.spend / s.chats : 0;
  return (
    <button type="button" className="lg-card wa-card" style={{ "--pc": WA }} onClick={onOpen}>
      <div className="lg-head">
        <span className="lg-ic"><i className="fa-brands fa-whatsapp" /></span>
        <b className="lg-name">WhatsApp</b>
        <span className={`pill ${s.chats || s.leads ? "pill-active" : "pill-default"}`}>{s.chats || s.leads ? "Live" : "No ads"}</span>
      </div>
      <div className="lg-desc">Click-to-WhatsApp ads and chats</div>
      <div className="lg-amt">{money(s.spend)}</div>
      <div className="lg-amt-sub">Spent, {label.toLowerCase()}</div>
      <div className="lg-pair wa-pair">
        <div><b>{count(s.chats)}</b><span>chats</span></div>
        <div><b>{count(s.leads)}</b><span>new leads</span></div>
        <div><b>{cpc ? money(cpc) : "—"}</b><span>per chat</span></div>
      </div>
      <span className="lg-open">Open WhatsApp leads</span>
    </button>
  );
}
