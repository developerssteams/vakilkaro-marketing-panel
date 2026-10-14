import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { whatsappConfig } from "../../../../lib/platform-config";
import { normalizePhone } from "../../../../lib/whatsapp-api";
import { enqueue, clearQueue } from "../../../../lib/message-queue";

/* ============================================================
   POST /api/whatsapp/send

   Panel yahan leads ki list bhejta hai. Ye unhe queue me daal
   deta hai — bhejta nahi. Bhejne ka kaam /dispatch karta hai,
   throttle ke saath.

   Yahan teen guard lagte hain, aur teeno zaroori hain:
     DND       — TRAI compliance, legal-tech ke liye optional nahi
     Cooldown  — bar-bar message se number ban ho jaata hai
     Attempts  — 3 baar mana kar chuka to aur nahi
   ============================================================ */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const cfg = whatsappConfig();
  if (!cfg.ready) {
    return NextResponse.json({
      error: "WhatsApp is not connected — add WA_TOKEN and WA_PHONE_ID to .env.",
      needsSetup: true,
    }, { status: 503 });
  }

  let d = {};
  try { d = await request.json(); } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const leads = Array.isArray(d.leads) ? d.leads : [];
  if (!leads.length) return NextResponse.json({ error: "No leads found" }, { status: 400 });
  if (!d.templateName) return NextResponse.json({ error: "Select a template" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const dnd = new Set((d.dndList || []).map((p) => normalizePhone(p)));
  const maxAttempts = Number(d.maxAttempts || 3);

  const jobs = [];
  const skipped = { dnd: 0, cooldown: 0, attempts: 0, badPhone: 0, duplicate: 0 };
  const seen = new Set();

  for (const l of leads) {
    const phone = normalizePhone(l.phone);

    if (phone.length < 11) { skipped.badPhone += 1; continue; }
    if (seen.has(phone)) { skipped.duplicate += 1; continue; }
    if (dnd.has(phone) || String(l.dnd) === "Yes") { skipped.dnd += 1; continue; }
    if (l.nextEligible && String(l.nextEligible).slice(0, 10) > today) { skipped.cooldown += 1; continue; }
    if (maxAttempts > 0 && Number(l.attempts || 0) >= maxAttempts) { skipped.attempts += 1; continue; }

    seen.add(phone);
    jobs.push({
      phone,
      leadId: l.id || "",
      leadName: l.name || "",
      templateName: d.templateName,
      language: d.language || cfg.defaultLang,
      /* Variables panel me hi bhar ke aate hain — server sirf bhejta hai. */
      variables: l.variables || [],
      buttonUrlParam: l.buttonUrlParam || d.buttonUrlParam || "",
      source: d.source || "broadcast",
      sourceId: d.sourceId || "",
      sourceName: d.sourceName || "",
    });
  }

  if (!jobs.length) {
    return NextResponse.json({
      ok: false,
      queued: 0,
      skipped,
      message: "All leads were skipped — due to DND, cooldown or attempts limit.",
    });
  }

  const res = enqueue(jobs);
  const mins = Math.ceil(res.queued / Math.max(1, cfg.throttlePerMinute));

  return NextResponse.json({
    ok: true,
    queued: res.queued,
    alreadyQueued: res.skipped,
    skipped,
    throttle: cfg.throttlePerMinute,
    estimatedMinutes: mins,
    message: `${res.queued} messages queued — at ${cfg.throttlePerMinute}/min this will take about ${mins} minutes.`,
  });
}

/* Queue se pending messages hata do — broadcast rokne ke liye. */
export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sourceId = new URL(request.url).searchParams.get("sourceId");
  const res = clearQueue(sourceId);
  return NextResponse.json({ ok: true, ...res, message: `${res.removed} pending messages removed.` });
}
