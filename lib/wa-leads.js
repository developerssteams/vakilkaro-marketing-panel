/* ============================================================
   lib/wa-leads.js — SERVER ONLY

   WhatsApp wali leads (Click-to-WhatsApp ads + seedhe WhatsApp
   karne wale) — panel ka apna WhatsApp webhook inhe WhatsApp
   database me likhta hai (lib/wa-db.js), yahan se Lead Capture
   me aati hain.

   .env:  WA_DATABASE_URL (purana naam WA_AI_DATABASE_URL bhi chalega)
   ============================================================ */
import { waDbReady, waPool, initWaDb } from "./wa-db";

export function waLeadsReady() { return waDbReady(); }
const pool = () => waPool();

/* since = "YYYY-MM-DD". Purane table me ad_id wagairah na ho to bhi chale. */
export async function fetchWaLeads(since) {
  await initWaDb();
  const p = pool();
  const cols = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'");
  const has = new Set(cols.rows.map((r) => r.column_name));
  const opt = (c) => (has.has(c) ? c : `NULL AS ${c}`);
  const sql = `SELECT id, wa_id, name, phone, email, service, campaign, source, created_at,
      ${opt("ad_id")}, ${opt("ad_headline")}, ${opt("ad_source_url")}, ${opt("ctwa_clid")}, ${opt("first_message")}
    FROM leads WHERE wa_id IS NOT NULL ${since ? "AND created_at >= $1" : ""}
    ORDER BY created_at DESC LIMIT 5000`;
  const { rows } = await p.query(sql, since ? [since] : []);
  return rows.map((r) => ({
    extId: `wa-${r.wa_id}`,
    waId: String(r.wa_id || ""),
    name: r.name || "",
    phone: String(r.phone || r.wa_id || "").replace(/\D/g, "").slice(-10),
    email: r.email || "",
    service: r.service || "",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
    fromAd: Boolean(r.ad_id) || r.source === "meta_ad",
    adId: r.ad_id ? String(r.ad_id) : "",
    adHeadline: r.ad_headline || "",
    campaignName: r.campaign || "",
    firstMessage: r.first_message || "",
  }));
}
