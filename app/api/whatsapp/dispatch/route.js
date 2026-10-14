import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { whatsappConfig } from "../../../../lib/platform-config";
import { sendTemplate } from "../../../../lib/whatsapp-api";
import { nextBatch, markSending, markSent, markFailed, queueStats } from "../../../../lib/message-queue";

/* ============================================================
   POST /api/whatsapp/dispatch

   Queue se messages uthake actually bhejta hai.

   Ek call me sirf ek batch jaata hai (throttle jitna), poori
   queue nahi. Wajah: 500 messages bhejne me 25 minute lagenge,
   aur HTTP request itni der khuli nahi rehni chahiye — timeout
   ho jayegi aur beech me messages atak jaayenge.

   Isliye panel har minute dobara call karta hai, ya cron chalata
   hai. Har call ek minute ka kaam karti hai.
   ============================================================ */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const cfg = whatsappConfig();
  if (!cfg.ready) {
    return NextResponse.json({ error: "WhatsApp is not connected", needsSetup: true }, { status: 503 });
  }

  let d = {};
  try { d = await request.json(); } catch { d = {}; }

  const limit = Math.min(Number(d.limit || cfg.throttlePerMinute), 60);
  const batch = nextBatch(limit);

  if (!batch.length) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, done: true,
      stats: queueStats(), message: "Queue is empty." });
  }

  markSending(batch.map((b) => b.id));

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const job of batch) {
    try {
      const res = await sendTemplate({
        to: job.phone,
        templateName: job.templateName,
        language: job.language,
        variables: job.variables,
        buttonUrlParam: job.buttonUrlParam,
      });
      markSent(job.id, res.messageId);
      sent += 1;
    } catch (err) {
      markFailed(job.id, err?.message || "unknown", err?.permanent);
      failed += 1;
      /* Har error alag se nahi dikhana — panel me pehle 3 kaafi hain. */
      if (errors.length < 3) errors.push({ phone: job.phone, message: err?.message || "unknown" });
    }

    /* Messages ke beech thoda gap — ek saath burst bhejne se Meta ki
       nazar me spam lagta hai aur number ki quality girti hai. */
    await new Promise((r) => setTimeout(r, Math.floor(60000 / Math.max(1, cfg.throttlePerMinute))));
  }

  const stats = queueStats();
  return NextResponse.json({
    ok: true,
    sent, failed, errors,
    done: stats.queued === 0,
    stats,
    message: `${sent} sent${failed ? `, ${failed} failed` : ""}. ${stats.queued} remaining.`,
  });
}
