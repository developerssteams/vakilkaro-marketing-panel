/* ============================================================
   lib/whatsapp-api.js  —  SERVER ONLY

   WhatsApp Cloud API se message bhejta hai.

   Do tarah ke message hote hain:
     TEMPLATE — Meta se pehle approve karana padta hai. Kisi bhi
                number par kabhi bhi bhej sakte ho. Broadcast aur
                journey isi se chalte hain.
     TEXT     — sirf 24 ghante ke andar, jab customer ne khud
                message kiya ho. Reply dene ke liye.

   Lost leads purani hoti hain, isliye Remarketing me hamesha
   TEMPLATE hi jaata hai — text kaam nahi karega.
   ============================================================ */

import { whatsappConfig, WA_API_VERSION } from "./platform-config";

const WA_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

async function waPost(path, body) {
  const { token } = whatsappConfig();
  if (!token) throw new Error("WA_TOKEN is not set in .env");

  const res = await fetch(`${WA_BASE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw waError(json.error, res.status);
  return json;
}

async function waGet(path, params = {}) {
  const { token } = whatsappConfig();
  if (!token) throw new Error("WA_TOKEN is not set in .env");

  const url = new URL(`${WA_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, String(v)); });

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw waError(json.error, res.status);
  return json;
}

/* Meta ke error codes samajh me nahi aate — Hinglish me badal dete hain. */
function waError(e = {}, status = 500) {
  const map = {
    190: "WA_TOKEN has expired or is invalid — create a new token.",
    100: "A field is invalid — check the template name or number.",
    131026: "This number is not on WhatsApp.",
    131047: "The 24-hour window is closed — only approved templates can be sent.",
    131049: "Meta blocked this message (quality/spam rule).",
    132000: "Template variables do not match — check the count.",
    132001: "This template does not exist or is not approved.",
    132015: "Template is paused — its quality dropped.",
    133010: "Phone number is not registered.",
    80007: "Rate limit — try again in a little while.",
    4: "Rate limit — try again in a little while.",
  };
  const msg = map[e.code] || e.error_data?.details || e.message || `WhatsApp API error (${status})`;
  const err = new Error(msg);
  err.code = e.code;
  /* Ye errors dobara try karne se theek nahi honge — queue me
     retry karne ka koi fayda nahi. */
  err.permanent = [131026, 132001, 132015, 133010].includes(e.code);
  return err;
}

/* India ke numbers — 10 digit ko 91 ke saath bhejna padta hai. */
export function normalizePhone(raw, countryCode = "91") {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return countryCode + d;
  if (d.length === 12 && d.startsWith(countryCode)) return d;
  if (d.length === 11 && d.startsWith("0")) return countryCode + d.slice(1);
  if (d.length > 12) return d.slice(-12);
  return d;
}

/* ---------- template message ---------- */
export async function sendTemplate({ to, templateName, language = "en", variables = [], buttonUrlParam }) {
  const { phoneId } = whatsappConfig();
  if (!phoneId) throw new Error("WA_PHONE_ID is not set in .env");

  const phone = normalizePhone(to);
  if (phone.length < 11) throw new Error(`Invalid number: ${to}`);

  const components = [];
  if (variables.length) {
    components.push({
      type: "body",
      parameters: variables.map((v) => ({ type: "text", text: String(v ?? "") })),
    });
  }
  /* Dynamic URL button — offer link har lead ka alag ho sakta hai. */
  if (buttonUrlParam) {
    components.push({
      type: "button", sub_type: "url", index: "0",
      parameters: [{ type: "text", text: String(buttonUrlParam) }],
    });
  }

  const json = await waPost(`${phoneId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: { name: templateName, language: { code: language }, ...(components.length ? { components } : {}) },
  });

  return {
    ok: true,
    messageId: json.messages?.[0]?.id || "",
    to: phone,
    /* Meta khud batata hai ki message accept hua ya number galat hai. */
    accepted: json.contacts?.[0]?.wa_id ? true : false,
  };
}

/* ---------- free-form text (sirf 24-ghante window me) ---------- */
export async function sendText({ to, body, previewUrl = true }) {
  const { phoneId } = whatsappConfig();
  if (!phoneId) throw new Error("WA_PHONE_ID is not set in .env");

  const phone = normalizePhone(to);
  if (phone.length < 11) throw new Error(`Invalid number: ${to}`);

  const json = await waPost(`${phoneId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: { preview_url: previewUrl, body: String(body || "").slice(0, 4096) },
  });
  return { ok: true, messageId: json.messages?.[0]?.id || "", to: phone };
}

/* ---------- approved templates ki list ---------- */
export async function listTemplates() {
  const { wabaId } = whatsappConfig();
  if (!wabaId) throw new Error("WA_WABA_ID is not set in .env");

  const json = await waGet(`${wabaId}/message_templates`, {
    fields: "name,status,category,language,components,quality_score",
    limit: 200,
  });

  return (json.data || []).map((t) => {
    const body = (t.components || []).find((c) => c.type === "BODY");
    const buttons = (t.components || []).find((c) => c.type === "BUTTONS");
    return {
      name: t.name,
      status: t.status,                 // APPROVED / PENDING / REJECTED
      category: t.category,
      language: t.language,
      bodyText: body?.text || "",
      /* {{1}} {{2}} gin lete hain — panel me utne hi variable maangenge */
      variableCount: (body?.text?.match(/\{\{\d+\}\}/g) || []).length,
      hasUrlButton: (buttons?.buttons || []).some((b) => b.type === "URL"),
      quality: t.quality_score?.score || "",
      usable: t.status === "APPROVED",
    };
  });
}

/* ---------- phone number ka haal ---------- */
export async function checkNumber() {
  const { phoneId } = whatsappConfig();
  if (!phoneId) throw new Error("WA_PHONE_ID is not set in .env");
  const json = await waGet(phoneId, {
    fields: "display_phone_number,verified_name,quality_rating,messaging_limit_tier",
  });
  return {
    ok: true,
    number: json.display_phone_number || "",
    name: json.verified_name || "",
    quality: json.quality_rating || "",
    tier: json.messaging_limit_tier || "",
  };
}

/* ---------- read receipt ---------- */
export async function markRead(messageId) {
  const { phoneId } = whatsappConfig();
  if (!phoneId || !messageId) return { ok: false };
  try {
    await waPost(`${phoneId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId });
    return { ok: true };
  } catch { return { ok: false }; }
}

/* ---------- variables bharna ----------
   Panel me {name} {service} likha jaata hai (padhne me aasan),
   par Meta {{1}} {{2}} maangta hai. Ye mapping wahi karta hai. */
export function fillVariables(order, lead, extra = {}) {
  const map = {
    name: lead.name || "",
    phone: lead.phone || "",
    service: lead.service || "",
    city: lead.city || "",
    amount: lead.quoted ? `₹${Number(lead.quoted).toLocaleString("en-IN")}` : "",
    offer: extra.offer || "",
    code: extra.code || "",
    link: extra.link || "",
    company: extra.company || "VakilKaro",
  };
  return (order || []).map((key) => map[key] ?? "");
}
