"use client";

/* ============================================================
   components/WhatsAppChats.js — WhatsApp Chats (sidebar)

   Pehle ye whatsapp-ai.vakilkaro.com/leads pe tha. Ab panel me:
   har WhatsApp contact, uski poori chat (AI ke jawab ke saath),
   ad se aaya ya seedha — sab ek jagah. Har 20 second taaza.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";

const initials = (n) => {
  const s = String(n || "").trim();
  if (!s || /^\+?\d[\d\s]*$/.test(s)) return s ? s.replace(/\D/g, "").slice(-2) : "?";
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
};
const t = (x) => (x ? new Date(x) : null);
function ago(x) {
  const d = t(x); if (!d) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
const hm = (x) => t(x)?.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) || "";
const dayLbl = (x) => t(x)?.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) || "";

export default function WhatsAppChats() {
  const [data, setData] = useState({ loading: true });
  const [flt, setFlt] = useState("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);
  const [chat, setChat] = useState({ loading: false, list: [] });
  const chatEnd = useRef(null);

  async function load(quiet = false) {
    if (!quiet) setData((d) => ({ ...d, loading: true }));
    try {
      const r = await fetch("/api/whatsapp/chats", { cache: "no-store" });
      const j = await r.json();
      setData({ loading: false, ...j });
    } catch { setData({ loading: false, error: "Could not reach the server" }); }
  }
  async function open(c, quiet = false) {
    setActive(c);
    if (!quiet) setChat({ loading: true, list: [] });
    try {
      const r = await fetch(`/api/whatsapp/chats?wa_id=${encodeURIComponent(c.wa_id)}`, { cache: "no-store" });
      const j = await r.json();
      setChat({ loading: false, list: j.messages || [] });
    } catch { setChat({ loading: false, list: [], error: true }); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => { load(true); if (active) open(active, true); }, 20000);
    return () => clearInterval(id);
  }, [active]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [chat.list.length, active?.wa_id]);

  const contacts = data.contacts || [];
  const counts = useMemo(() => ({
    all: contacts.length,
    ad: contacts.filter((c) => c.ad_id || c.source === "meta_ad").length,
    direct: contacts.filter((c) => !(c.ad_id || c.source === "meta_ad")).length,
    today: contacts.filter((c) => t(c.created_at)?.toDateString() === new Date().toDateString()).length,
  }), [contacts]);
  const shown = useMemo(() => {
    let l = contacts;
    if (flt === "ad") l = l.filter((c) => c.ad_id || c.source === "meta_ad");
    else if (flt === "direct") l = l.filter((c) => !(c.ad_id || c.source === "meta_ad"));
    else if (flt === "today") l = l.filter((c) => t(c.created_at)?.toDateString() === new Date().toDateString());
    const k = q.trim().toLowerCase();
    if (k) l = l.filter((c) => [c.name, c.phone, c.wa_id, c.ad_headline, c.last_message].some((v) => String(v || "").toLowerCase().includes(k)));
    return l.slice(0, 300);
  }, [contacts, flt, q]);

  /* chat ko din-wise group */
  const grouped = useMemo(() => {
    const out = []; let last = "";
    chat.list.forEach((m) => { const d = dayLbl(m.created_at); if (d !== last) { out.push({ day: d }); last = d; } out.push(m); });
    return out;
  }, [chat.list]);

  if (data.configured === false) {
    return (
      <div className="wc-setup">
        <span className="wc-setup-ic"><i className="fa-brands fa-whatsapp" /></span>
        <h3>Connect the WhatsApp database</h3>
        <p>The WhatsApp bot and its chats now live inside this panel. Add these lines to <code>.env.local</code> (copy the values from the old whatsapp-ai app) and restart:</p>
        <pre>{`WA_DATABASE_URL=postgresql://wa_user:...@localhost:5432/wa_ai
WA_TOKEN=<WhatsApp permanent token>
WA_VERIFY_TOKEN=<same verify token as before>
OPENAI_API_KEY=<OpenAI key>`}</pre>
        <p>Then point the WhatsApp webhook in Meta to <code>https://YOUR-PANEL-DOMAIN/api/whatsapp/webhook</code>.</p>
      </div>
    );
  }

  return (
    <div className="wc">
      <div className="wc-top">
        <div className="wc-kpis">
          <div><b>{counts.all.toLocaleString("en-IN")}</b><span>contacts</span></div>
          <div><b>{counts.today.toLocaleString("en-IN")}</b><span>new today</span></div>
          <div><b>{counts.ad.toLocaleString("en-IN")}</b><span>from ads</span></div>
          <div className={`wc-bot ${data.bot ? "on" : "off"}`}><b><i className={`fa-solid ${data.bot ? "fa-robot" : "fa-power-off"}`} /> {data.bot ? "On" : "Off"}</b><span>AI replies</span></div>
        </div>
        <div className="wc-actions">
          <a className="btn btn-ghost" href="/connect" target="_blank" rel="noreferrer" title="Share this link with a client to connect their WhatsApp number">
            <i className="fa-solid fa-link" /> Connect a client number{data.clients ? ` (${data.clients})` : ""}
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => load()} disabled={data.loading}>
            <i className={`fa-solid ${data.loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
          </button>
        </div>
      </div>
      {data.error ? <div className="wc-err"><i className="fa-solid fa-triangle-exclamation" /> {data.error}</div> : null}

      <div className={`wc-split${active ? " has-active" : ""}`}>
        <aside className="wc-list">
          <div className="wc-list-h">
            <label className="wc-search"><i className="fa-solid fa-magnifying-glass" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number, message" aria-label="Search chats" /></label>
            <div className="wc-chips">
              {[["all", "All"], ["today", "Today"], ["ad", "From ads"], ["direct", "Direct"]].map(([k, l]) => (
                <button key={k} type="button" className={flt === k ? "on" : ""} onClick={() => setFlt(k)}>{l} <em>{counts[k]}</em></button>
              ))}
            </div>
          </div>
          <div className="wc-rows">
            {data.loading && !contacts.length ? <div className="wc-none"><i className="fa-solid fa-spinner fa-spin" /> Loading chats…</div> : null}
            {!data.loading && !shown.length ? <div className="wc-none">No chats here yet.</div> : null}
            {shown.map((c) => (
              <button type="button" key={c.id} className={`wc-row${active?.wa_id === c.wa_id ? " on" : ""}`} onClick={() => open(c)}>
                <span className="wc-av">{initials(c.name || c.phone)}</span>
                <div className="wc-row-m">
                  <div className="wc-row-t"><b>{c.name || c.phone || `+${c.wa_id}`}</b><small>{ago(c.last_at || c.created_at)}</small></div>
                  <div className="wc-row-s">{c.last_message || c.first_message || "—"}</div>
                  {c.ad_id || c.source === "meta_ad" ? <span className="wc-tag"><i className="fa-solid fa-bullhorn" /> {c.ad_headline || "From ad"}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="wc-chat">
          {!active ? (
            <div className="wc-empty"><i className="fa-brands fa-whatsapp" /><b>Pick a chat</b><span>See the full conversation, including AI replies.</span></div>
          ) : (
            <>
              <div className="wc-chat-h">
                <button type="button" className="wc-back" onClick={() => setActive(null)} aria-label="Back"><i className="fa-solid fa-arrow-left" /></button>
                <span className="wc-av lg">{initials(active.name || active.phone)}</span>
                <div className="wc-chat-id"><b>{active.name || "Unknown"}</b><span>{active.phone || `+${active.wa_id}`}{active.ad_id || active.source === "meta_ad" ? ` · from ad${active.ad_headline ? `: ${active.ad_headline}` : ""}` : " · direct"}</span></div>
                <a className="btn btn-gold wc-open" href={`https://wa.me/${active.wa_id}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> Open in WhatsApp</a>
              </div>
              <div className="wc-msgs">
                {chat.loading ? <div className="wc-none"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div> : null}
                {!chat.loading && !chat.list.length ? <div className="wc-none">No messages saved for this contact.</div> : null}
                {grouped.map((m, i) => m.day ? (
                  <div key={`d${i}`} className="wc-day"><span>{m.day}</span></div>
                ) : (
                  <div key={i} className={`wc-b ${m.direction === "in" ? "in" : "out"}`}>
                    <p>{m.body}</p>
                    <small>{m.is_ai ? <><i className="fa-solid fa-robot" /> AI · </> : null}{hm(m.created_at)}</small>
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
