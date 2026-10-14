"use client";

/* ============================================================
   components/MarkRecovered.js

   Queue se "Recovered" tak ka raasta.

   Pehle Recovered tab manual tha — staff ko lead ka naam, quote,
   order value, din, sab haath se bharna padta tha. Aur Lost Pool
   me status bhi alag se badalna padta tha. Do jagah likhna matlab
   ek jagah reh jaana — phir bucket ka Recovery % kabhi sach nahi
   dikhta.

   Ab ek click me teeno kaam hote hain:
     1. Recovered tab me row bane
     2. Lost Pool me status "Recovered" ho (bucket % isse banta hai)
     3. Queue se row hat jaye
   ============================================================ */

import { useMemo, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { useToast } from "./Toast";
import { money } from "./ModuleParts";

const POOL = "audience__lost-pool";
const QUEUE = "win-back-queue__my-queue";
const RECOVERED = "win-back-queue__recovered";
const OFFERS = "outreach__offers";

export default function MarkRecovered({ row, onClose, onDone }) {
  const { show } = useToast();
  const digits = String(row.contact || "").replace(/\D/g, "").slice(-10);

  /* Lost Pool se asli data uthate hain — quote, service, bucket,
     lost date. Staff ko dobara type nahi karna padta. */
  const lead = useMemo(
    () => readRows(POOL).find((l) => String(l.phone || "").replace(/\D/g, "").slice(-10) === digits),
    [digits],
  );

  const offers = useMemo(() => readRows(OFFERS), []);
  const quoted = Number(row.quoted || lead?.quoted || 0);

  const [form, setForm] = useState({
    orderValue: quoted ? String(quoted) : "",
    offer: "",
    recoveryCost: "",
    attribution: "Remarketing",
  });

  /* Lost hone se aaj tak kitne din — ye manually ginna galat hota
     hai, isliye lost date se nikaal lete hain. */
  const days = useMemo(() => {
    const from = lead?.lostAt || row.lastContact;
    if (!from) return "";
    const d = Math.round((Date.now() - new Date(from).getTime()) / 86400000);
    return d >= 0 ? String(d) : "";
  }, [lead, row]);

  const orderVal = Number(form.orderValue || 0);
  const discount = quoted && orderVal ? quoted - orderVal : 0;

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function save() {
    if (!orderVal || orderVal <= 0) { show("Enter the final order value.", "error"); return; }

    /* 1 · Recovered row */
    const rec = readRows(RECOVERED);
    writeRows(RECOVERED, [{
      id: uid(),
      name: row.name || lead?.name || "",
      contact: digits,
      service: row.service || lead?.service || "",
      quoted: quoted ? String(quoted) : "",
      orderValue: String(orderVal),
      /* Discount bhi recovery cost hai — wo paisa hum chhod rahe hain */
      recoveryCost: form.recoveryCost || (discount > 0 ? String(discount) : "0"),
      journey: row.remark ? String(row.remark).slice(0, 60) : "",
      offer: form.offer,
      days,
      attribution: form.attribution,
      owner: row.owner || "",
      status: "Pending Handoff",
      bucket: lead?.bucket || row.reason || "",
      recoveredAt: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    }, ...rec]);

    /* 2 · Lost Pool — bucket ka Recovery % isi status se banta hai */
    if (lead) {
      const pool = readRows(POOL);
      writeRows(POOL, pool.map((l) => (l.id === lead.id
        ? { ...l, status: "Recovered", nextEligible: "", updatedAt: new Date().toISOString() }
        : l)));
    }

    /* 3 · Queue se hatao — kaam ho gaya, list me rakhne ka matlab nahi */
    const q = readRows(QUEUE);
    writeRows(QUEUE, q.map((x) => (x.id === row.id
      ? { ...x, status: "Recovered", disposition: "Interested", updatedAt: new Date().toISOString() }
      : x)));

    /* 4 · Offer ka usage counter */
    if (form.offer) {
      const off = readRows(OFFERS);
      const hit = off.find((o) => String(o.code || "") === form.offer || String(o.name || "") === form.offer);
      if (hit) {
        writeRows(OFFERS, off.map((o) => (o.id === hit.id
          ? { ...o, used: String(Number(o.used || 0) + 1) } : o)));
      }
    }

    logActivity({
      dataset: RECOVERED, action: "Created", target: row.name,
      detail: `Recovered ${money(orderVal)}${discount > 0 ? ` · ${money(discount)} discount` : ""}${days ? ` · ${days} days` : ""}`,
    });

    show(`${row.name} recovered — ${money(orderVal)}`, "success");
    window.dispatchEvent(new CustomEvent("vk-marketing-updated"));
    if (onDone) onDone();
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal marketing-modal">
        <div className="modal-head">
          <div className="mt"><i className="fa-solid fa-trophy" /> Mark recovered</div>
          <button className="modal-x" type="button" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="modal-body">
          <div className="mr-lead">
            <b>{row.name}</b>
            <span>{digits}</span>
            {row.service ? <span className="pill pill-default">{row.service}</span> : null}
            {(lead?.bucket || row.reason) ? <span className="pill pill-default">{lead?.bucket || row.reason}</span> : null}
          </div>

          <div className="grid2">
            <label className="fg">
              <span className="form-label">Originally quoted</span>
              <input className="form-control" value={quoted ? money(quoted) : "—"} readOnly disabled />
            </label>
            <label className="fg">
              <span className="form-label">Final order value *</span>
              <input className="form-control" type="number" value={form.orderValue}
                onChange={(e) => set("orderValue", e.target.value)} placeholder="6000" />
            </label>
          </div>

          {discount > 0 ? (
            <div className="mr-note">
              <i className="fa-solid fa-tag" />
              <span><b>{money(discount)}</b> discount given — this counts as recovery cost. It shows whether the recovered lead was really cheaper.</span>
            </div>
          ) : null}

          <div className="grid2">
            <label className="fg">
              <span className="form-label">Offer used</span>
              <select className="form-control" value={form.offer} onChange={(e) => set("offer", e.target.value)}>
                <option value="">— none —</option>
                {offers.map((o) => <option key={o.id} value={o.code || o.name}>{o.code || o.name}</option>)}
              </select>
            </label>
            <label className="fg">
              <span className="form-label">Recovery cost</span>
              <input className="form-control" type="number" value={form.recoveryCost}
                onChange={(e) => set("recoveryCost", e.target.value)}
                placeholder={discount > 0 ? String(discount) : "0"} />
              <span className="fg-note">If left empty, only the discount is counted</span>
            </label>
          </div>

          <div className="grid2">
            <label className="fg">
              <span className="form-label">Days to recover</span>
              <input className="form-control" value={days || "—"} readOnly disabled />
              <span className="fg-note">Automatic from the lost date</span>
            </label>
            <label className="fg">
              <span className="form-label">Attribution</span>
              <select className="form-control" value={form.attribution} onChange={(e) => set("attribution", e.target.value)}>
                <option>Remarketing</option>
                <option>Original Campaign</option>
              </select>
              <span className="fg-note">Analytics → Compare is built from this</span>
            </label>
          </div>

          <div className="mr-note ok">
            <i className="fa-solid fa-circle-check" />
            <span>On save: a row is created in the Recovered tab, and the Lost Pool status becomes
              <b> Recovered</b> (the bucket's Recovery % comes from this), and this lead will be removed from the queue.</span>
          </div>
        </div>

        <div className="marketing-modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" type="button" onClick={save}>
            <i className="fa-solid fa-trophy" /> Mark recovered
          </button>
        </div>
      </div>
    </div>
  );
}
