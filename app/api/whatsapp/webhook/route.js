import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { whatsappConfig } from "../../../../lib/platform-config";
import { updateStatus, markReplied } from "../../../../lib/message-queue";
import { pushReply, drainReplies } from "../../../../lib/reply-inbox";
import { currentUser } from "../../../../lib/session";

/* ============================================================
   /api/whatsapp/webhook

   Meta yahan do cheezein bhejta hai:
     STATUS — delivered / read / failed
     REPLY  — customer ne jawab diya

   Reply sabse keemti hai. Jisne reply kiya wo interested hai —
   usko staff turant call kare. Isliye reply seedha inbox me
   jaata hai aur panel use Win-back Queue me daal deta hai.

   GET  = Meta ka handshake (setup ke waqt ek baar)
   POST = actual events
   ============================================================ */

/* ---------- handshake ---------- */
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");

  const cfg = whatsappConfig();
  if (mode === "subscribe" && token && token === cfg.verifyToken) {
    /* Meta plain text challenge wapas maangta hai, JSON nahi. */
    return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/* ---------- events ---------- */
export async function POST(request) {
  const cfg = whatsappConfig();
  const raw = await request.text();

  /* Signature check — iske bina koi bhi fake "delivered" bhej ke
     tumhare numbers kharab dikha sakta hai. */
  if (cfg.appSecret) {
    const sig = request.headers.get("x-hub-signature-256") || "";
    const expected = "sha256=" + crypto.createHmac("sha256", cfg.appSecret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body = {};
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ ok: true });   // Meta ko 200 hi dena hai
  }

  let statuses = 0;
  let replies = 0;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};

      /* delivered / read / failed */
      for (const s of v.statuses || []) {
        if (updateStatus(s.id, s.status)) statuses += 1;
      }

      /* customer ka reply */
      for (const m of v.messages || []) {
        const phone = m.from || "";
        const text = m.text?.body
          || m.button?.text
          || m.interactive?.button_reply?.title
          || m.interactive?.list_reply?.title
          || `[${m.type}]`;

        const src = markReplied(phone);
        const profileName = (v.contacts || []).find((c) => c.wa_id === phone)?.profile?.name || "";

        pushReply({
          phone,
          name: profileName,
          text,
          type: m.type || "text",
          messageId: m.id || "",
          at: new Date(Number(m.timestamp || Date.now() / 1000) * 1000).toISOString(),
          /* Kis broadcast/journey ka jawab hai — attribution ke liye */
          sourceId: src?.sourceId || "",
          sourceName: src?.sourceName || "",
          leadId: src?.leadId || "",
          leadName: src?.leadName || profileName,
        });
        replies += 1;
      }
    }
  }

  /* Meta ko hamesha 200 dena — warna wo retry karta rahega aur
     phir webhook hi band kar deta hai. */
  return NextResponse.json({ ok: true, statuses, replies });
}

/* ---------- panel replies uthata hai ---------- */
export async function PUT() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const replies = drainReplies();
  return NextResponse.json({ ok: true, replies, count: replies.length });
}
