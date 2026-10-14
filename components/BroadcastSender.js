"use client";

/* ============================================================
   components/BroadcastSender.js

   Outreach → Broadcast ka asli engine.

   Flow: audience chuno → template chuno → preview dekho →
   send → live progress.

   Send karte hi sab nahi jaata — queue banti hai aur throttle ke
   hisaab se dheere-dheere jaata hai. Panel har minute dispatch
   call karta rehta hai jab tak queue khatam na ho.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { readRows, writeRows, logActivity } from "../lib/marketing-local";
import { useToast } from "./Toast";
import { count } from "./ModuleParts";

const POOL = "audience__lost-pool";
const BUCKETS = "audience__buckets";
const BROADCAST = "outreach__broadcast";

/* Panel me {name} likha jaata hai, Meta {{1}} maangta hai —
   ye list dropdown me dikhti hai taaki mapping saaf rahe. */
const VARIABLES = [
  { key: "name", label: "Lead name" },
  { key: "service", label: "Service" },
  { key: "city", label: "City" },
  { key: "amount", label: "Quoted amount" },
  { key: "offer", label: "Offer text" },
  { key: "code", label: "Coupon code" },
  { key: "link", label: "Link" },
  { key: "company", label: "Company name" },
];

export default function BroadcastSender({ broadcast, onClose }) {
  const { show } = useToast();
  const [step, setStep] = useState(1);
  const [setup, setSetup] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [pool, setPool] = useState([]);
  const [buckets, setBuckets] = useState([]);

  const [filters, setFilters] = useState({ bucket: "", service: "", priority: "", readyOnly: true });
  const [tpl, setTpl] = useState("");
  const [varMap, setVarMap] = useState([]);
  const [offerText, setOfferText] = useState("");
  const [link, setLink] = useState("");

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    setPool(readRows(POOL));
    setBuckets(readRows(BUCKETS));
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((j) => {
        setSetup(j);
        setTemplates((j.templates || []).filter((t) => t.usable));
      })
      .catch(() => setSetup({ needsSetup: true }));
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  /* Filters lagane ke baad kaun-kaun bachte hain */
  const audience = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return pool.filter((l) => {
      if (String(l.dnd) === "Yes") return false;
      if (["Recovered", "Archived"].includes(String(l.status))) return false;
      if (filters.bucket && String(l.bucket) !== filters.bucket) return false;
      if (filters.service && String(l.service) !== filters.service) return false;
      if (filters.priority && String(l.priority) !== filters.priority) return false;
      if (filters.readyOnly && l.nextEligible && String(l.nextEligible).slice(0, 10) > today) return false;
      return true;
    });
  }, [pool, filters]);

  /* Kitne skip honge — user ko pehle hi pata chalna chahiye */
  const excluded = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      dnd: pool.filter((l) => String(l.dnd) === "Yes").length,
      cooldown: pool.filter((l) => l.nextEligible && String(l.nextEligible).slice(0, 10) > today).length,
      noPhone: audience.filter((l) => String(l.phone || "").replace(/\D/g, "").length < 10).length,
    };
  }, [pool, audience]);

  const selectedTpl = templates.find((t) => t.name === tpl);
  const services = useMemo(() => [...new Set(pool.map((l) => l.service).filter(Boolean))].sort(), [pool]);

  /* Template badla to variable slots reset — har template me
     alag count hota hai. */
  useEffect(() => {
    if (!selectedTpl) { setVarMap([]); return; }
    setVarMap(Array.from({ length: selectedTpl.variableCount }, (_, i) => varMap[i] || (i === 0 ? "name" : "service")));
  }, [tpl]); // eslint-disable-line

  function previewText() {
    if (!selectedTpl) return "";
    const sample = audience[0] || {};
    const vals = {
      name: sample.name || "Rahul Sharma",
      service: sample.service || "Trademark Registration",
      city: sample.city || "Jaipur",
      amount: sample.quoted ? `₹${Number(sample.quoted).toLocaleString("en-IN")}` : "₹5,999",
      offer: offerText || "20% off",
      code: offerText || "WINBACK20",
      link: link || "vakilkaro.in",
      company: "VakilKaro",
    };
    let out = selectedTpl.bodyText;
    varMap.forEach((key, i) => { out = out.replace(`{{${i + 1}}}`, vals[key] ?? ""); });
    return out;
  }

  async function startSend() {
    if (!selectedTpl) { show("Select a template.", "error"); return; }
    if (!audience.length) { show("No leads match this filter.", "error"); return; }

    setSending(true);
    const sourceId = broadcast?.id || `bc_${Date.now()}`;

    try {
      const leads = audience.map((l) => ({
        id: l.id, name: l.name, phone: l.phone, dnd: l.dnd,
        attempts: l.attempts, nextEligible: l.nextEligible,
        variables: varMap.map((key) => {
          const map = {
            name: l.name || "", service: l.service || "", city: l.city || "",
            amount: l.quoted ? `₹${Number(l.quoted).toLocaleString("en-IN")}` : "",
            offer: offerText, code: offerText, link, company: "VakilKaro",
          };
          return map[key] ?? "";
        }),
        buttonUrlParam: selectedTpl.hasUrlButton ? link : "",
      }));

      const res = await fetch("/api/whatsapp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads, templateName: tpl, language: selectedTpl.language,
          source: "broadcast", sourceId, sourceName: broadcast?.name || "Broadcast",
          maxAttempts: 3,
        }),
      });
      const j = await res.json();

      if (!res.ok) { show(j.error || "Queue was not created", "error"); setSending(false); return; }
      if (!j.queued) { show(j.message || "All leads were skipped.", "error"); setSending(false); return; }

      show(j.message, "success");
      setStep(4);
      markCooldown(audience);
      saveBroadcast(sourceId, j.queued);
      pump(sourceId);
    } catch {
      show("Could not reach the server.", "error");
      setSending(false);
    }
  }

  /* Queue khaali hone tak dispatch call karte raho. */
  function pump(sourceId) {
    const tick = async () => {
      try {
        const res = await fetch("/api/whatsapp/dispatch", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        });
        const j = await res.json();
        const st = await fetch(`/api/whatsapp/status?sourceId=${sourceId}`).then((r) => r.json());
        setProgress(st.source || null);
        syncBroadcast(sourceId, st.source);

        if (j.done) {
          clearInterval(timer.current);
          setSending(false);
          show("Broadcast completed.", "success");
        }
      } catch { /* agli tick pe try karenge */ }
    };
    tick();
    timer.current = setInterval(tick, 15000);
  }

  /* Message gaya to attempts badhao aur cooldown lagao — bina iske
     wahi lead kal phir list me aa jayegi. */
  function markCooldown(leads) {
    const rows = readRows(POOL);
    const bmap = {};
    buckets.forEach((b) => { bmap[b.name] = Number(b.cooldownDays || 30); });
    const ids = new Set(leads.map((l) => l.id));

    writeRows(POOL, rows.map((r) => {
      if (!ids.has(r.id)) return r;
      const days = bmap[r.bucket] || 30;
      const next = new Date(); next.setDate(next.getDate() + days);
      return {
        ...r,
        attempts: String(Number(r.attempts || 0) + 1),
        nextEligible: next.toISOString().slice(0, 10),
        status: r.status === "Pool" ? "Sequenced" : r.status,
      };
    }));
  }

  function saveBroadcast(sourceId, queued) {
    const rows = readRows(BROADCAST);
    const existing = rows.find((r) => r.id === sourceId);
    const patch = {
      channel: "WhatsApp", template: tpl, audience: describeFilters(),
      sent: String(queued), status: "Running",
      scheduledAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    };
    if (existing) writeRows(BROADCAST, rows.map((r) => (r.id === sourceId ? { ...r, ...patch } : r)));
    else writeRows(BROADCAST, [{ id: sourceId, name: broadcast?.name || `Broadcast ${new Date().toLocaleDateString("en-IN")}`, ...patch, createdAt: new Date().toISOString() }, ...rows]);

    logActivity({ dataset: BROADCAST, action: "Created", target: broadcast?.name || "Broadcast",
      detail: `${queued} WhatsApp messages queued · template ${tpl}` });
  }

  /* Delivery report webhook se aata hai — panel usko row me likh deta hai. */
  function syncBroadcast(sourceId, s) {
    if (!s) return;
    const rows = readRows(BROADCAST);
    writeRows(BROADCAST, rows.map((r) => (r.id === sourceId ? {
      ...r,
      sent: String(s.sent), delivered: String(s.delivered), read: String(s.read),
      replies: String(s.replied), failed: String(s.failed),
      status: s.pending ? "Running" : "Completed",
    } : r)));
  }

  function describeFilters() {
    const bits = [];
    if (filters.bucket) bits.push(filters.bucket);
    if (filters.service) bits.push(filters.service);
    if (filters.priority) bits.push(`${filters.priority} priority`);
    return bits.join(" · ") || "All lost leads";
  }

  async function stopSend() {
    if (!window.confirm("Stop pending messages? Messages already sent cannot be recalled.")) return;
    const sourceId = broadcast?.id || "";
    await fetch(`/api/whatsapp/send?sourceId=${sourceId}`, { method: "DELETE" });
    clearInterval(timer.current);
    setSending(false);
    show("Remaining messages stopped.", "success");
  }

  /* ---------- setup nahi hai ---------- */
  if (setup?.needsSetup) {
    return (
      <div className="card">
        <div className="mod-empty">
          <i className="fa-brands fa-whatsapp" style={{ color: "#25D366" }} />
          <p><b>WhatsApp is not connected.</b><br />
            <code>WA_TOKEN</code>, <code>WA_PHONE_ID</code> and <code>WA_WABA_ID</code> <code>.env.local</code> — add them there and restart the server. Until then you can create broadcast records manually.</p>
        </div>
      </div>
    );
  }

  if (!setup) return <div className="card"><div className="mod-empty"><i className="fa-solid fa-spinner fa-spin" /><p>Checking WhatsApp...</p></div></div>;

  return (
    <>
      <div className="wa-steps">
        {["Audience", "Template", "Preview", "Send"].map((s, i) => (
          <div key={s} className={`wa-step${step === i + 1 ? " on" : ""}${step > i + 1 ? " done" : ""}`}>
            <span className="wa-num">{step > i + 1 ? <i className="fa-solid fa-check" /> : i + 1}</span>{s}
          </div>
        ))}
      </div>

      {/* ---------- 1 · AUDIENCE ---------- */}
      {step === 1 ? (
        <div className="card">
          <div className="card-head">
            <div className="ttl"><i className="fa-solid fa-users" /> &nbsp;Who to send to</div>
            <div className="card-tools"><span className="cnt">{audience.length} leads</span></div>
          </div>
          <div className="settings-body">
            <div className="grid3">
              <label className="fg"><span className="form-label">Bucket</span>
                <select className="form-control" value={filters.bucket} onChange={(e) => setFilters({ ...filters, bucket: e.target.value })}>
                  <option value="">All buckets</option>
                  {buckets.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select></label>
              <label className="fg"><span className="form-label">Service</span>
                <select className="form-control" value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}>
                  <option value="">All services</option>
                  {services.map((s) => <option key={s}>{s}</option>)}
                </select></label>
              <label className="fg"><span className="form-label">Priority</span>
                <select className="form-control" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                  <option value="">All</option><option>High</option><option>Medium</option><option>Low</option>
                </select></label>
            </div>

            <label className="wa-check">
              <input type="checkbox" checked={filters.readyOnly} onChange={(e) => setFilters({ ...filters, readyOnly: e.target.checked })} />
              Ready leads only (cooldown finished)
            </label>

            <div className="wa-audience">
              <div className="wa-big">{count(audience.length)}</div>
              <div className="wa-big-sub">leads will receive the message</div>
              <div className="wa-excl">
                {excluded.dnd ? <span><i className="fa-solid fa-ban" /> {excluded.dnd} DND</span> : null}
                {excluded.cooldown ? <span><i className="fa-solid fa-clock" /> {excluded.cooldown} in cooldown</span> : null}
                {excluded.noPhone ? <span><i className="fa-solid fa-phone-slash" /> {excluded.noPhone} no number</span> : null}
              </div>
            </div>

            {audience.length ? (
              <div className="wa-sample">
                <b>First 5:</b> {audience.slice(0, 5).map((l) => l.name).join(", ")}
                {audience.length > 5 ? `+${audience.length - 5} more` : ""}
              </div>
            ) : null}
          </div>
          <div className="wa-foot">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" type="button" disabled={!audience.length} onClick={() => setStep(2)}>
              Next <i className="fa-solid fa-arrow-right" />
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------- 2 · TEMPLATE ---------- */}
      {step === 2 ? (
        <div className="card">
          <div className="card-head">
            <div className="ttl"><i className="fa-brands fa-whatsapp" /> &nbsp;Select template</div>
            <div className="card-tools"><span className="cnt">{templates.length} approved</span></div>
          </div>
          <div className="settings-body">
            {templates.length ? (
              <>
                <label className="fg"><span className="form-label">Approved template</span>
                  <select className="form-control" value={tpl} onChange={(e) => setTpl(e.target.value)}>
                    <option value="">— select —</option>
                    {templates.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.language}){t.quality ? ` · ${t.quality}` : ""}</option>)}
                  </select>
                  <span className="fg-note">Only APPROVED templates are shown — Meta does not allow sending without approval.</span>
                </label>

                {selectedTpl ? (
                  <>
                    <div className="wa-tpl-body">{selectedTpl.bodyText}</div>

                    {selectedTpl.variableCount ? (
                      <>
                        <div className="form-label" style={{ marginTop: 14 }}>Map variables</div>
                        {varMap.map((v, i) => (
                          <div className="wa-var" key={i}>
                            <span className="wa-var-n">{`{{${i + 1}}}`}</span>
                            <select className="form-control" value={v} onChange={(e) => {
                              const next = [...varMap]; next[i] = e.target.value; setVarMap(next);
                            }}>
                              {VARIABLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </select>
                          </div>
                        ))}
                      </>
                    ) : null}

                    {varMap.some((v) => ["offer", "code"].includes(v)) ? (
                      <label className="fg"><span className="form-label">Offer / coupon text</span>
                        <input className="form-control" value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder="WINBACK20 ya 20% off" /></label>
                    ) : null}

                    {varMap.includes("link") || selectedTpl.hasUrlButton ? (
                      <label className="fg"><span className="form-label">Link</span>
                        <input className="form-control" value={link} onChange={(e) => setLink(e.target.value)} placeholder="vakilkaro.in/trademark" /></label>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <div className="mod-empty" style={{ padding: 24 }}>
                <i className="fa-solid fa-file-circle-xmark" />
                <p>No approved template found. Create a template in Meta Business Manager and wait for approval (24–48 hours).</p>
              </div>
            )}
          </div>
          <div className="wa-foot">
            <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}><i className="fa-solid fa-arrow-left" /> Back</button>
            <button className="btn btn-gold" type="button" disabled={!tpl} onClick={() => setStep(3)}>Next <i className="fa-solid fa-arrow-right" /></button>
          </div>
        </div>
      ) : null}

      {/* ---------- 3 · PREVIEW ---------- */}
      {step === 3 ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-eye" /> &nbsp;Review before sending</div></div>
          <div className="settings-body">
            <div className="wa-preview">
              <div className="wa-ph-head"><i className="fa-brands fa-whatsapp" /> {setup?.number?.name || "VakilKaro"}</div>
              <div className="wa-ph-body">
                <div className="wa-bubble">
                  {previewText()}
                  <span className="wa-time">11:24 AM</span>
                </div>
              </div>
            </div>

            <div className="wa-confirm">
              <Row k="How many leads" v={count(audience.length)} strong />
              <Row k="Template" v={tpl} />
              <Row k="Audience" v={describeFilters()} />
              <Row k="Speed" v={`${setup?.throttle || 20} messages / minute`} />
              <Row k="Approx. time" v={`${Math.ceil(audience.length / Math.max(1, setup?.throttle || 20))} minute`} strong />
              {setup?.number?.quality ? <Row k="Number quality" v={setup.number.quality} /> : null}
            </div>

            <div className="wa-warn">
              <i className="fa-solid fa-triangle-exclamation" />
              <span>As soon as you press Send, messages <b>will really be sent</b> and it will cost money. DND and cooldown leads are skipped automatically.</span>
            </div>
          </div>
          <div className="wa-foot">
            <button className="btn btn-ghost" type="button" onClick={() => setStep(2)}><i className="fa-solid fa-arrow-left" /> Back</button>
            <button className="btn btn-gold" type="button" disabled={sending} onClick={startSend}>
              <i className={`fa-solid ${sending ? "fa-spinner fa-spin" : "fa-paper-plane"}`} /> {sending ? "Sending..." : `Send to ${audience.length}`}
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------- 4 · PROGRESS ---------- */}
      {step === 4 ? (
        <div className="card">
          <div className="card-head">
            <div className="ttl"><i className="fa-solid fa-tower-cell" /> &nbsp;Sending</div>
            <div className="card-tools">
              {sending ? <span className="cnt"><i className="fa-solid fa-circle" style={{ color: "var(--green)", fontSize: 7 }} /> Live</span> : <span className="cnt">Done</span>}
            </div>
          </div>
          <div className="settings-body">
            <div className="wa-prog">
              {[
                ["Sent", progress?.sent || 0, "fa-paper-plane"],
                ["Delivered", progress?.delivered || 0, "fa-check-double"],
                ["Read", progress?.read || 0, "fa-eye"],
                ["Replied", progress?.replied || 0, "fa-reply"],
                ["Failed", progress?.failed || 0, "fa-xmark"],
              ].map(([label, v, icon]) => (
                <div className="wa-prog-box" key={label}>
                  <div className="wa-prog-l"><i className={`fa-solid ${icon}`} /> {label}</div>
                  <div className="wa-prog-v">{count(v)}</div>
                </div>
              ))}
            </div>

            {progress?.pending ? (
              <div className="wa-pending"><i className="fa-solid fa-clock" /> {count(progress.pending)} remaining — updating every 15 seconds.</div>
            ) : null}

            {!setup?.hasWebhook ? (
              <div className="wa-warn" style={{ marginTop: 14 }}>
                <i className="fa-solid fa-circle-info" />
                <span>Webhook is not set — so <b>delivered/read/replied</b> will not update. Only "sent" will show.</span>
              </div>
            ) : null}
          </div>
          <div className="wa-foot">
            {sending ? <button className="btn btn-ghost" type="button" onClick={stopSend}><i className="fa-solid fa-stop" /> Stop</button> : <span />}
            <button className="btn btn-gold" type="button" onClick={onClose}>
              <i className="fa-solid fa-check" /> {sending ? "Let it run in the background" : "Done"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({ k, v, strong }) {
  return <div className={`cf-row${strong ? " strong" : ""}`}><span>{k}</span><b>{v}</b></div>;
}
