"use client";

/* ============================================================
   components/ReplyInbox.js

   Jisne reply kiya wo interested hai — yahi sabse keemti signal
   hai poore Remarketing me.

   Isliye reply aate hi ek click me Win-back Queue me chali jaati
   hai, taaki staff usko turant call kare. Broadcast ke 500 me se
   jo 40 log jawab dete hain, asli kaam unhi par hota hai.
   ============================================================ */

import { useEffect, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { useToast } from "./Toast";

const REPLIES = "outreach__replies";
const QUEUE = "win-back-queue__my-queue";
const POOL = "audience__lost-pool";

export default function ReplyInbox() {
  const { show } = useToast();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [hasWebhook, setHasWebhook] = useState(true);

  useEffect(() => {
    const load = () => setRows(readRows(REPLIES));
    load();
    window.addEventListener("vk-marketing-updated", load);
    fetch("/api/whatsapp/status").then((r) => r.json()).then((j) => setHasWebhook(Boolean(j.hasWebhook))).catch(() => {});
    pull();
    /* Har 30 second me nayi replies check — staff ko turant pata chale */
    const t = setInterval(pull, 30000);
    return () => { window.removeEventListener("vk-marketing-updated", load); clearInterval(t); };
  }, []);

  async function pull(manual) {
    if (manual) setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/webhook", { method: "PUT" });
      const j = await res.json();
      const incoming = j.replies || [];

      if (incoming.length) {
        const existing = readRows(REPLIES);
        const seen = new Set(existing.map((r) => r.messageId).filter(Boolean));
        const add = incoming
          .filter((r) => !r.messageId || !seen.has(r.messageId))
          .map((r) => ({
            id: uid(), phone: r.phone, name: r.leadName || r.name || "Unknown",
            text: r.text, at: r.at, messageId: r.messageId,
            sourceName: r.sourceName || "", leadId: r.leadId || "",
            state: "new",
          }));
        if (add.length) {
          writeRows(REPLIES, [...add, ...existing].slice(0, 300));
          show(`${add.length} new replies received.`, "success");
        }
      } else if (manual) {
        show("No new replies.", "success");
      }
    } catch {
      if (manual) show("Could not reach the server.", "error");
    } finally {
      if (manual) setBusy(false);
    }
  }

  /* Reply → Win-back Queue. Lead pool me mil jaye to uska data
     bhi le lete hain — service, quoted amount, bucket. */
  function toQueue(reply) {
    const pool = readRows(POOL);
    const digits = String(reply.phone).replace(/\D/g, "").slice(-10);
    const lead = pool.find((l) => String(l.phone || "").replace(/\D/g, "").slice(-10) === digits);

    const queue = readRows(QUEUE);
    if (queue.some((q) => String(q.contact || "").replace(/\D/g, "").slice(-10) === digits && q.status === "Queued")) {
      show("This lead is already in the queue.", "error");
      return;
    }

    writeRows(QUEUE, [{
      id: uid(),
      name: lead?.name || reply.name,
      contact: digits,
      service: lead?.service || "",
      reason: lead?.bucket || "",
      quoted: lead?.quoted || "",
      dueDate: new Date().toISOString().slice(0, 10),
      /* Reply aayi hai matlab garam lead hai — High priority */
      priority: "High",
      owner: lead?.lastStaff || "",
      remark: `WhatsApp reply: "${String(reply.text).slice(0, 80)}"`,
      status: "Queued",
      createdAt: new Date().toISOString(),
    }, ...queue]);

    writeRows(REPLIES, readRows(REPLIES).map((r) => (r.id === reply.id ? { ...r, state: "queued" } : r)));
    logActivity({ dataset: QUEUE, action: "Created", target: reply.name, detail: `Queued from WhatsApp reply · ${reply.sourceName || "broadcast"}` });
    show(`${reply.name} added to the queue — High priority.`, "success");
  }

  function dismiss(reply) {
    writeRows(REPLIES, readRows(REPLIES).map((r) => (r.id === reply.id ? { ...r, state: "dismissed" } : r)));
    show("Removed.", "success");
  }

  const fresh = rows.filter((r) => r.state === "new");

  return (
    <div className="card">
      <div className="card-head">
        <div className="ttl">
          <i className="fa-solid fa-reply" />
          <div className="ttl-txt">
            <b>Reply Inbox</b>
            <span>Whoever replied is interested — add them to the queue in one click</span>
          </div>
        </div>
        <div className="card-tools">
          <span className="cnt">{fresh.length} new</span>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => pull(true)}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Check
          </button>
        </div>
      </div>

      {!hasWebhook ? (
        <div className="wa-warn" style={{ margin: "0 18px 14px" }}>
          <i className="fa-solid fa-circle-info" />
          <span>Webhook is not set — replies will not arrive automatically. <code>WA_WEBHOOK_VERIFY_TOKEN</code> — add it and set the webhook URL in Meta.</span>
        </div>
      ) : null}

      {fresh.length ? (
        <div className="ri-list">
          {fresh.map((r) => (
            <div className="ri-row" key={r.id}>
              <div className="ri-av">{String(r.name || "?").slice(0, 2).toUpperCase()}</div>
              <div className="ri-mid">
                <div className="ri-top">
                  <b>{r.name}</b>
                  <span className="ri-phone">{r.phone}</span>
                  {r.sourceName ? <span className="pill pill-default">{r.sourceName}</span> : null}
                  <span className="ri-time">{new Date(r.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
                <div className="ri-text">{r.text}</div>
              </div>
              <div className="ri-act">
                <a className="icon-btn" title="WhatsApp" target="_blank" rel="noopener noreferrer"
                  href={`https://wa.me/${String(r.phone).replace(/\D/g, "")}`}><i className="fa-brands fa-whatsapp" /></a>
                <a className="icon-btn" title="Call" href={`tel:+${String(r.phone).replace(/\D/g, "")}`}><i className="fa-solid fa-phone" /></a>
                <button className="btn btn-gold" type="button" onClick={() => toQueue(r)}>
                  <i className="fa-solid fa-arrow-right" /> Queue
                </button>
                <button className="icon-btn" title="Dismiss" onClick={() => dismiss(r)}><i className="fa-solid fa-xmark" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mod-empty">
          <i className="fa-solid fa-inbox" />
          <p>No new replies yet. Replies will appear here after you send a broadcast.</p>
        </div>
      )}
    </div>
  );
}
