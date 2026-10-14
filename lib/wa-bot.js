/* ============================================================
   lib/wa-bot.js — SERVER ONLY

   WhatsApp AI agent (pehle whatsapp-ai app me tha). Customer ke
   message ka jawab OpenAI se, VakilKaro ki services/price list
   (lib/wa-knowledge.json) ke hisaab se.

   .env.local:
     WA_TOKEN (ya purana WHATSAPP_TOKEN) — WhatsApp permanent token
     OPENAI_API_KEY, OPENAI_MODEL (default gpt-4o-mini)
     WA_BOT=off   → AI jawab band (messages phir bhi save hote hain)
   ============================================================ */
import knowledge from "./wa-knowledge.json";

const GRAPH = "https://graph.facebook.com/v21.0";
const waToken = () => process.env.WA_TOKEN || process.env.WHATSAPP_TOKEN || "";

export function botEnabled() {
  return Boolean(process.env.OPENAI_API_KEY && waToken()) && String(process.env.WA_BOT || "on").toLowerCase() !== "off";
}

function knowledgeText() {
  const lines = (knowledge.services || []).map((s) => {
    let line = `• ${s.name} (${s.category}) — starts ₹${s.starting_price} + ${s.gst_percent}% GST, ~${s.timeline_days} days`;
    if (s.packages?.length) line += ` | Packages: ${s.packages.map((p) => `${p.name} ₹${p.price}${p.popular ? " (popular)" : ""}`).join(", ")}`;
    if (s.documents_required?.length) line += ` | Docs: ${s.documents_required.slice(0, 4).join(", ")}`;
    return line;
  });
  const combos = (knowledge.combos || []).map((c) => `• ${c.name} — ₹${c.price} (includes: ${c.includes.join(", ")})`);
  return `SERVICES:\n${lines.join("\n")}\n\nCOMBOS:\n${combos.join("\n") || "None"}`;
}

function systemPrompt() {
  return `You are the official WhatsApp assistant of VakilKaro (Jsons Solicitors Pvt. Ltd.), an Indian legal-tech company (vakilkaro.com).

YOUR JOB: understand the customer's need, recommend the right VakilKaro service, explain it simply, share price/packages/timeline and the documents needed, and guide them to start. Warm, confident, consultative — never pushy.

LANGUAGE RULE: Detect the customer's language and REPLY IN THE SAME LANGUAGE (Hindi→Hindi, Hinglish→Hinglish, English→English, Tamil/Gujarati/Telugu/Marathi→same). Match their tone.

STYLE: Short, WhatsApp-friendly (2–5 lines). Use ₹. Ask ONE question at a time.

RULES: Only quote services/prices/docs from the DATA below — never invent a price. GST is extra; government fees vary by state (say "approx"). If they're ready to buy or ask for a human, collect name + service and say a VakilKaro expert will connect. No binding legal advice.

DATA:
${knowledgeText()}`;
}

export async function askAI(userText) {
  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: userText }],
      max_tokens: 400, temperature: 0.6,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("OpenAI error:", JSON.stringify(data)); return "Sorry, thoda technical issue aa gaya. Ek minute mein dobara try karein 🙏"; }
  return data.choices?.[0]?.message?.content?.trim() || "Main samajh nahi paaya, kya aap dobara bata sakte hain?";
}

export async function sendText(phoneNumberId, to, text, token = "") {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || waToken()}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  if (!res.ok) console.error("WhatsApp send error:", await res.text());
  return res.ok;
}
