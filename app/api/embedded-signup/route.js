import { NextResponse } from "next/server";
import { saveClient, waDbReady } from "../../../lib/wa-db";

/* ============================================================
   POST /api/embedded-signup  (pehle whatsapp-ai app me tha)

   Client /connect pe "Login with Facebook" karta hai → yahan
   { code, phone_number_id, waba_id } aata hai. Ye:
     1. code → client ka access token
     2. us WABA ko hamare app se subscribe (messages hamare webhook pe)
     3. number ko Cloud API pe register (India storage + pin)
     4. client ko WhatsApp database me save → bot us number pe bhi jawab deta hai
   ============================================================ */
const GRAPH = "https://graph.facebook.com/v21.0";
const APP_ID = process.env.WA_APP_ID || process.env.META_APP_ID || "1752005389283386";
const appSecret = () => process.env.APP_SECRET || process.env.WA_APP_SECRET || process.env.META_APP_SECRET || "";

export async function POST(request) {
  try {
    const { code, phone_number_id: phoneNumberId, waba_id: wabaId } = await request.json().catch(() => ({}));
    if (!code || typeof code !== "string") return NextResponse.json({ error: "No code received" }, { status: 400 });
    if (!appSecret()) return NextResponse.json({ error: "APP_SECRET is not set in .env.local" }, { status: 400 });
    if (wabaId && !/^\d{5,25}$/.test(String(wabaId))) return NextResponse.json({ error: "Invalid WABA ID" }, { status: 400 });
    if (phoneNumberId && !/^\d{5,25}$/.test(String(phoneNumberId))) return NextResponse.json({ error: "Invalid phone number ID" }, { status: 400 });

    const u = new URL(`${GRAPH}/oauth/access_token`);
    u.searchParams.set("client_id", APP_ID);
    u.searchParams.set("client_secret", appSecret());
    u.searchParams.set("code", code);
    const tokenData = await fetch(u.toString()).then((r) => r.json()).catch(() => ({}));
    if (tokenData.error || !tokenData.access_token) {
      console.error("embedded-signup token exchange failed:", tokenData.error?.message);
      return NextResponse.json({ error: tokenData.error?.message || "token exchange failed" }, { status: 400 });
    }
    const clientToken = tokenData.access_token;
    const auth = { Authorization: `Bearer ${clientToken}` };

    if (wabaId) {
      const sub = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: auth }).then((r) => r.json()).catch(() => ({}));
      if (sub.error) console.error("subscribe failed:", sub.error.message);
      if (phoneNumberId) {
        await fetch(`${GRAPH}/${phoneNumberId}/settings`, {
          method: "POST", headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ storage_configuration: { status: "IN_COUNTRY_STORAGE_ENABLED", data_localization_region: "IN" } }),
        }).catch(() => {});
        await fetch(`${GRAPH}/${phoneNumberId}/register`, {
          method: "POST", headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", pin: process.env.WA_REGISTER_PIN || "020100" }),
        }).catch(() => {});
      }
    }

    if (waDbReady()) {
      try { await saveClient({ wabaId, phoneNumberId, token: clientToken }); }
      catch (e) { console.error("client save failed:", e.message); }
    }
    return NextResponse.json({ success: true, waba_id: wabaId || null, phone_number_id: phoneNumberId || null });
  } catch (e) {
    console.error("embedded-signup error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
