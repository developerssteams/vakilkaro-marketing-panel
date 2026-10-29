/* ============================================================
   lib/website-db.js — SERVER ONLY

   Website (vakilkaro.com) ke forms ki leads — Hostinger ke MySQL se.
   Teen tables:
     · enquiries         — service page ka enquiry form
     · contact_messages  — contact us form
     · odr_disputes      — ODR dispute form

   Sirf SELECT — website ka data kabhi badla / delete nahi hota.

   .env:
     WEBSITE_DB_HOST      (hPanel → Databases → Remote MySQL me dikhta hai, jaise srv1130.hstgr.io)
     WEBSITE_DB_PORT      3306
     WEBSITE_DB_NAME      u804497200_admin
     WEBSITE_DB_USER
     WEBSITE_DB_PASSWORD
     WEBSITE_DB_TZ        (optional) DB me time kis zone me likha hai — default +05:30 (IST)

   Website DB me created_at IST ki ghadi ke hisaab se save hai (jaise
   "2026-10-27 20:49:13" = raat 8:49 IST). Use UTC maan lete to 5:30
   ghante aage dikhta tha — isliye text ki tarah padh ke IST lagate hain.
   ============================================================ */
import mysql from "mysql2/promise";

const clean = (v) => String(v ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

export function websiteDbConfig() {
  const host = clean(process.env.WEBSITE_DB_HOST);
  const database = clean(process.env.WEBSITE_DB_NAME);
  const user = clean(process.env.WEBSITE_DB_USER);
  return {
    host, database, user,
    port: Number(clean(process.env.WEBSITE_DB_PORT) || 3306),
    password: clean(process.env.WEBSITE_DB_PASSWORD),
    tz: /^[+-]\d{2}:\d{2}$/.test(clean(process.env.WEBSITE_DB_TZ)) ? clean(process.env.WEBSITE_DB_TZ) : "+05:30",
    ready: Boolean(host && database && user),
  };
}

function friendly(err) {
  const c = err?.code || "";
  if (c === "ER_ACCESS_DENIED_ERROR") return new Error("Website database: wrong user or password (WEBSITE_DB_USER / WEBSITE_DB_PASSWORD).");
  if (c === "ER_BAD_DB_ERROR") return new Error("Website database: database name is wrong (WEBSITE_DB_NAME).");
  if (c === "ER_HOST_NOT_PRIVILEGED" || c === "ER_DBACCESS_DENIED_ERROR") return new Error("Website database: this server is not allowed — in Hostinger hPanel → Databases → Remote MySQL add host % (Any Host) for this database.");
  if (c === "ETIMEDOUT" || c === "ECONNREFUSED" || c === "ENOTFOUND") return new Error("Website database: could not reach the server — check WEBSITE_DB_HOST and that Remote MySQL is on in Hostinger.");
  return new Error(`Website database: ${err?.message || "error"}`);
}

/* "section-8-ngo-registration" → "Section 8 NGO Registration" */
const UPPER = new Set(["ngo", "nbfc", "gst", "llp", "opc", "fssai", "msme", "iso", "iec", "odr", "fcra", "itr", "tds", "roc", "dsc", "pf", "esi", "rbi", "sebi", "ipo"]);
function pretty(slug) {
  return String(slug || "").split(/[-_\s]+/).filter(Boolean)
    .map((w) => (UPPER.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}
/* "2026-10-27 20:49:13" (DB ki ghadi) → asli waqt (ISO, UTC) */
function fromDb(v, tz) {
  const s = v instanceof Date ? v.toISOString().slice(0, 19) : String(v || "").trim().replace(" ", "T").slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return "";
  const t = new Date(`${s}${tz}`);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString();
}
/* Asli waqt → DB ki ghadi ka text (WHERE created_at >= ? ke liye) */
function toDb(isoStr, tz) {
  const t = Date.parse(isoStr);
  if (!Number.isFinite(t)) return "2000-01-01 00:00:00";
  const [, sign, hh, mm] = tz.match(/([+-])(\d{2}):(\d{2})/);
  const off = (sign === "-" ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60000;
  return new Date(t + off).toISOString().slice(0, 19).replace("T", " ");
}

const TABLES = [
  {
    table: "enquiries", form: "Enquiry form",
    sql: "SELECT id, name, phone, email, location, message, service_slug, page_url, status, created_at FROM enquiries WHERE created_at >= ? ORDER BY id DESC LIMIT 5000",
    map: (r) => ({ service: pretty(r.service_slug), city: r.location || "", email: r.email || "" }),
  },
  {
    table: "contact_messages", form: "Contact form",
    sql: "SELECT id, name, phone, email, service, message, page_url, status, created_at FROM contact_messages WHERE created_at >= ? ORDER BY id DESC LIMIT 5000",
    map: (r) => ({ service: r.service || "", city: "", email: r.email || "" }),
  },
  {
    table: "odr_disputes", form: "ODR dispute",
    sql: "SELECT id, name, phone, dispute_type, message, page_url, status, created_at FROM odr_disputes WHERE created_at >= ? ORDER BY id DESC LIMIT 5000",
    map: (r) => ({ service: r.dispute_type ? `ODR – ${r.dispute_type}` : "ODR", city: "", email: "" }),
  },
];

/* sinceIso (UTC) ke baad ki saari website leads */
export async function fetchWebsiteLeads(sinceIso) {
  const cfg = websiteDbConfig();
  if (!cfg.ready) throw new Error("WEBSITE_DB_HOST, WEBSITE_DB_NAME and WEBSITE_DB_USER are not set");
  let conn;
  try {
    conn = await mysql.createConnection({
      host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
      connectTimeout: 15000, dateStrings: true,
    });
    await conn.query("SET time_zone = '+00:00'");
  } catch (e) { throw friendly(e); }

  const since = toDb(sinceIso || "2000-01-01T00:00:00Z", cfg.tz);
  const out = { leads: [], errors: [], counts: {} };
  try {
    for (const t of TABLES) {
      try {
        const [rows] = await conn.query(t.sql, [since]);
        out.counts[t.table] = rows.length;
        rows.forEach((r) => {
          const extra = t.map(r);
          out.leads.push({
            extId: `web-${t.table}-${r.id}`,
            table: t.table, form: t.form,
            name: String(r.name || "").trim(),
            phone: String(r.phone || "").replace(/\D/g, "").slice(-10),
            email: extra.email, city: extra.city, service: extra.service,
            message: String(r.message || "").slice(0, 500),
            pageUrl: r.page_url || "",
            webStatus: r.status || "",
            createdAt: fromDb(r.created_at, cfg.tz),
          });
        });
      } catch (e) {
        out.errors.push({ table: t.table, message: e?.code === "ER_NO_SUCH_TABLE" ? `table ${t.table} not found` : friendly(e).message });
      }
    }
  } finally {
    await conn.end().catch(() => {});
  }
  return out;
}