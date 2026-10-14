/* ============================================================
   lib/wa-db.js — SERVER ONLY

   WhatsApp bot ka database (pehle whatsapp-ai app me tha, ab yahin).
   Wahi purana PostgreSQL — purani saari leads aur chats waise hi
   rehti hain. Tables aur naye column khud ban jaate hain.

   .env.local:  WA_DATABASE_URL = postgresql://wa_user:...@localhost:5432/wa_ai
   (purana naam WA_AI_DATABASE_URL bhi chalega)
   ============================================================ */
import { Pool } from "pg";

const g = globalThis;
/* Database kahan hai, ye khud dhoondhte hain:
     1. WA_DATABASE_URL  (server pe ya aapke PC pe PostgreSQL — localhost:5432)
     2. sirf local (npm run dev) me, pehla na mile to WA_DATABASE_URL_DEV
        (server ka database tunnel se — 127.0.0.1:5433, "npm run wa-tunnel")
   Jo chal jaaye wahi yaad rehta hai. */
const isDev = () => process.env.NODE_ENV !== "production";
const mainUrl = () => process.env.WA_DATABASE_URL || process.env.WA_AI_DATABASE_URL || "";
const devUrl = () => (isDev() ? process.env.WA_DATABASE_URL_DEV || "" : "");
export function waDbUrl() { return mainUrl() || devUrl(); }
export function waDbReady() { return Boolean(waDbUrl()); }

const unreachable = (e) => /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|AggregateError/i.test(`${e?.code || ""} ${e?.name || ""} ${e?.message || ""} ${(e?.errors || []).map((x) => x?.code).join(" ")}`);

function makePool(url) {
  /* "localhost" Windows pe ::1 (IPv6) pe jaata hai jahan Postgres nahi sunta — 127.0.0.1 pakka */
  return new Pool({ connectionString: url.replace("@localhost:", "@127.0.0.1:"), max: 5, idleTimeoutMillis: 20000, connectionTimeoutMillis: 6000 });
}

export function waPool() {
  if (!g.__vkWa) g.__vkWa = { which: mainUrl() ? "main" : "dev", pools: {} };
  const st = g.__vkWa;
  const get = (w) => { if (!st.pools[w]) st.pools[w] = makePool(w === "main" ? mainUrl() : devUrl()); return st.pools[w]; };
  return {
    async query(text, params) {
      try { return await get(st.which).query(text, params); }
      catch (e) {
        /* local pe pehla address na mile to doosra try karo */
        const other = st.which === "main" ? "dev" : "main";
        const otherUrl = other === "main" ? mainUrl() : devUrl();
        if (isDev() && unreachable(e) && otherUrl) {
          const r = await get(other).query(text, params);
          st.which = other;
          return r;
        }
        throw e;
      }
    },
  };
}

export async function initWaDb() {
  if (g.__vkWaReady) return;
  await waPool().query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      wa_id TEXT, name TEXT, email TEXT, phone TEXT, service TEXT, campaign TEXT,
      source TEXT, lang TEXT, bucket TEXT DEFAULT 'cold', score INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY, wa_id TEXT, direction TEXT, body TEXT,
      is_ai BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_wa ON messages(wa_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_wa ON leads(wa_id);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_id TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_headline TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_source_url TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_message TEXT;
  `);
  g.__vkWaReady = true;
}

export async function saveMessage(waId, direction, body, isAi = false) {
  await initWaDb();
  await waPool().query("INSERT INTO messages (wa_id, direction, body, is_ai) VALUES ($1,$2,$3,$4)", [waId, direction, body, isAi]);
  await waPool().query("UPDATE leads SET updated_at = now() WHERE wa_id = $1", [waId]);
}

/* Naya number = nayi lead. referral = Click-to-WhatsApp ad ka data
   (Meta sirf ad se aaye pehle message me bhejta hai). */
export async function ensureLeadFromWhatsApp(waId, name, referral = null, firstText = "") {
  await initWaDb();
  const ad = referral && (referral.source_type === "ad" || referral.source_id) ? referral : null;
  const p = waPool();
  const found = await p.query("SELECT id, ad_id, name FROM leads WHERE wa_id=$1 LIMIT 1", [waId]);
  if (!found.rows.length) {
    await p.query(
      `INSERT INTO leads (wa_id, name, phone, source, ad_id, ad_headline, ad_source_url, ctwa_clid, first_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [waId, name || null, "+" + waId, ad ? "meta_ad" : "whatsapp",
        ad?.source_id || null, ad?.headline || null, ad?.source_url || null, ad?.ctwa_clid || null,
        String(firstText || "").slice(0, 500) || null],
    );
    return { created: true };
  }
  const row = found.rows[0];
  if (ad && !row.ad_id) {
    await p.query(
      "UPDATE leads SET source='meta_ad', ad_id=$2, ad_headline=$3, ad_source_url=$4, ctwa_clid=$5, updated_at=now() WHERE id=$1",
      [row.id, ad.source_id || null, ad.headline || null, ad.source_url || null, ad.ctwa_clid || null],
    );
  } else if (name && !row.name) {
    await p.query("UPDATE leads SET name=$2 WHERE id=$1", [row.id, name]);
  }
  return { created: false };
}

/* WhatsApp Chats page — contacts (naye pehle) */
export async function listContacts(limit = 1000) {
  await initWaDb();
  const { rows } = await waPool().query(`
    SELECT l.id, l.wa_id, l.name, l.phone, l.email, l.service, l.campaign, l.source, l.lang, l.bucket,
           l.ad_id, l.ad_headline, l.first_message, l.created_at, l.updated_at,
           (SELECT COUNT(*) FROM messages m WHERE m.wa_id = l.wa_id) AS msg_count,
           (SELECT body FROM messages m WHERE m.wa_id = l.wa_id ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT created_at FROM messages m WHERE m.wa_id = l.wa_id ORDER BY created_at DESC LIMIT 1) AS last_at
    FROM leads l WHERE l.wa_id IS NOT NULL
    ORDER BY COALESCE((SELECT created_at FROM messages m WHERE m.wa_id = l.wa_id ORDER BY created_at DESC LIMIT 1), l.created_at) DESC
    LIMIT $1`, [limit]);
  return rows;
}

export async function messagesOf(waId) {
  await initWaDb();
  const { rows } = await waPool().query(
    "SELECT direction, body, is_ai, created_at FROM messages WHERE wa_id=$1 ORDER BY created_at ASC LIMIT 2000", [waId]);
  return rows;
}

/* ---------- Embedded Signup: client ke apne WhatsApp numbers ----------
   /connect pe client Facebook se login karke apna number jodta hai;
   uska token yahan save hota hai aur bot us number pe bhi jawab deta hai. */
export async function ensureClientsTable() {
  await initWaDb();
  await waPool().query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      waba_id TEXT UNIQUE,
      phone_number_id TEXT,
      business_name TEXT,
      access_token TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

export async function saveClient({ wabaId, phoneNumberId, token }) {
  await ensureClientsTable();
  await waPool().query(
    `INSERT INTO clients (waba_id, phone_number_id, access_token) VALUES ($1,$2,$3)
     ON CONFLICT (waba_id) DO UPDATE SET phone_number_id=$2, access_token=$3`,
    [wabaId || null, phoneNumberId || null, token],
  );
}

/* Jis number pe message aaya, uska token (client ka) — warna apna WA_TOKEN */
export async function tokenForNumber(phoneNumberId) {
  if (!waDbReady() || !phoneNumberId) return "";
  try {
    await initWaDb();
    const r = await waPool().query("SELECT access_token FROM clients WHERE phone_number_id=$1 LIMIT 1", [phoneNumberId]);
    return r.rows[0]?.access_token || "";
  } catch { return ""; }  /* clients table abhi bani nahi */
}

export async function listClients() {
  if (!waDbReady()) return [];
  try {
    await initWaDb();
    const r = await waPool().query("SELECT waba_id, phone_number_id, business_name, created_at FROM clients ORDER BY created_at DESC");
    return r.rows;
  } catch { return []; }
}

/* Error ko samajhne layak banao — local PC pe DB nahi milta to tunnel ka hint */
export function waDbError(e) {
  /* Node "localhost" pe ::1 aur 127.0.0.1 dono try karta hai — dono fail ho to
     AggregateError aata hai jiska message khaali hota hai; asli code andar hai */
  const inner = (e?.errors || []).map((x) => x?.code || x?.message).filter(Boolean);
  const code = e?.code || inner[0] || "";
  const m = String(e?.message || code || e || "not reachable") + (code && !String(e?.message || "").includes(code) ? ` (${code})` : "");
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|AggregateError/i.test(m + code)) {
    if (process.env.NODE_ENV !== "production") {
      return "Cannot reach the WhatsApp database from this computer. Tried this PC (127.0.0.1:5432) and the tunnel (127.0.0.1:5433). If PostgreSQL is installed on this PC, start its service; if the database is on the server, run  npm run wa-tunnel  in a second terminal and keep it open. Then press Refresh.";
    }
    return `${m} — the panel cannot reach the WhatsApp database. Check that PostgreSQL is running on this server and that WA_DATABASE_URL in .env.local / .env is correct.`;
  }
  if (/password authentication failed/i.test(m)) return `${m} — check the user/password in WA_DATABASE_URL.`;
  return m;
}
