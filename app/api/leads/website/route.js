import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { websiteConfig } from "../../../../lib/platform-config";
import { pushLead, drainLeads, queueSize } from "../../../../lib/lead-queue";

/* ============================================================
   POST /api/leads/website   — website ka form yahan lead bhejta hai
   GET  /api/leads/website   — panel queue khaali karke apne me le leta hai

   Website ke liye koi Meta/Google token nahi chahiye — ye leads
   tumhari apni hain. Sirf ek shared secret chahiye taaki koi
   bahar se fake leads na daal de.
   ============================================================ */

export async function POST(request) {
  const cfg = websiteConfig();
  if (!cfg.ready) {
    return NextResponse.json({ error: "WEBSITE_LEAD_SECRET is not set in .env" }, { status: 503 });
  }

  const sent = request.headers.get("x-vk-secret") || "";
  if (sent !== cfg.secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let body = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const name = String(body.name || body.full_name || "").trim();
  const phone = String(body.phone || body.mobile || "").replace(/\D/g, "").slice(-10);

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (phone.length < 10) return NextResponse.json({ error: "10-digit phone is required" }, { status: 400 });

  const lead = {
    name,
    phone,
    email: String(body.email || "").trim(),
    service: String(body.service || "").trim(),
    campaign: String(body.campaign || body.utm_campaign || "").trim(),
    city: String(body.city || "").trim(),
    message: String(body.message || "").slice(0, 500),
    source: "Website",
    receivedAt: new Date().toISOString().slice(0, 10),
    receivedFullAt: new Date().toISOString(),
  };

  pushLead(lead);
  return NextResponse.json({ ok: true, queued: queueSize() });
}

/* Panel poll karke queue khaali karta hai. Drain isliye — ek lead
   do baar panel me nahi aani chahiye. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const leads = drainLeads();
  return NextResponse.json({ ok: true, leads, count: leads.length });
}
