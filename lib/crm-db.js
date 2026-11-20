/* ============================================================
   lib/crm-db.js  —  SERVER ONLY

   CRM ke MySQL se lost leads laata hai.

   Do baatein jaan-boojh kar aisi hain:

   1. Sirf SELECT. Koi INSERT/UPDATE/DELETE nahi. CRM live hai aur
      usme clients ka data hai — panel se galti se kuch bigad na jaye.

   2. Column ke naam .env se aate hain. Har CRM ka schema alag hota
      hai — kisi me `mobile`, kisi me `phone`, kisi me `contact_no`.
      Code me hardcode karte to har baar file badalni padti.
   ============================================================ */

import mysql from "mysql2/promise";

/* Vercel me value quotes ke saath paste ho jaaye ("abc") to quotes hata do */
const envClean = (v) => String(v ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

export function crmConfig() {
  const host = envClean(process.env.CRM_DB_HOST);
  const database = envClean(process.env.CRM_DB_NAME);
  const user = envClean(process.env.CRM_DB_USER);

  return {
    host,
    port: Number(process.env.CRM_DB_PORT || 3306),
    database,
    user,
    password: envClean(process.env.CRM_DB_PASSWORD),
    table: process.env.CRM_LEADS_TABLE || "leads",

    /* Stage table — kuch CRM me lost status alag table me hota hai
       aur leads se stage_id se juda hota hai. Aisa ho to ye bharo. */
    stage: {
      table: process.env.CRM_STAGE_TABLE || "",
      id: process.env.CRM_STAGE_ID_COL || "id",
      label: process.env.CRM_STAGE_LABEL_COL || "label",
      leadFk: process.env.CRM_COL_STAGE_ID || "stage_id",
    },

    /* Staff table — leads.assigned_to me staff ka ID hota hai, naam nahi.
       Naam ke bina panel me "5" ya "12" dikhega, jo kisi kaam ka nahi.
       Isliye users table se JOIN karke naam laate hain. */
    staff: {
      table: process.env.CRM_STAFF_TABLE || "",
      id: process.env.CRM_STAFF_ID_COL || "id",
      name: process.env.CRM_STAFF_NAME_COL || "name",
      leadFk: process.env.CRM_COL_STAFF || "assigned_to",
    },

    /* Column mapping — CRM me jo naam hai wo yahan likho */
    col: {
      id: process.env.CRM_COL_ID || "id",
      name: process.env.CRM_COL_NAME || "name",
      phone: process.env.CRM_COL_PHONE || "phone",
      email: process.env.CRM_COL_EMAIL || "email",
      city: process.env.CRM_COL_CITY || "city",
      service: process.env.CRM_COL_SERVICE || "service",
      status: process.env.CRM_COL_STATUS || "status",
      reason: process.env.CRM_COL_REASON || "",      // khaali ho sakta hai
      quoted: process.env.CRM_COL_QUOTED || "",
      campaign: process.env.CRM_COL_CAMPAIGN || "",
      staff: process.env.CRM_COL_STAFF || "",
      lostAt: process.env.CRM_COL_LOST_AT || "updated_at",
      pipeline: process.env.CRM_COL_PIPELINE_ID || "",
      stageId: process.env.CRM_COL_STAGE_ID || "",
    },

    /* Lost kaise mark hota hai — comma se ek se zyada value */
    lostValues: (process.env.CRM_LOST_STATUS || "Lost,lost,Rejected,rejected,Closed Lost,Not Interested")
      .split(",").map((x) => x.trim()).filter(Boolean),

    /* Stage table se kaam ho raha hai ya seedha status column se */
    useStageTable: Boolean(process.env.CRM_STAGE_TABLE),
    useStaffTable: Boolean(process.env.CRM_STAFF_TABLE),

    ready: Boolean(host && database && user),
  };
}

/* SQL injection se bachne ke liye — column ke naam parameter nahi ban
   sakte, isliye sirf safe characters allow karte hain. */
function safeIdent(name) {
  const clean = String(name || "").replace(/[^a-zA-Z0-9_]/g, "");
  if (!clean) throw new Error(`Invalid column name: "${name}"`);
  return `\`${clean}\``;
}

async function connect() {
  const cfg = crmConfig();
  if (!cfg.ready) throw new Error("CRM_DB_HOST, CRM_DB_NAME and CRM_DB_USER are not set in .env");

  try {
    return await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectTimeout: 15000,
      /* Hostinger ke shared MySQL par SSL configure nahi hota */
      ssl: process.env.CRM_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  } catch (err) {
    throw friendlyError(err);
  }
}

/* MySQL ke error codes samajh me nahi aate — Hinglish me badal dete hain. */
function friendlyError(err) {
  /* Pehle hi samjha hua error hai (connect() se aaya) — dobara mat badlo,
     warna IP / user wala detail mit jaata hai */
  if (err?.friendly) return err;
  const map = {
    ER_ACCESS_DENIED_ERROR: "Username or password is wrong.",
    ER_BAD_DB_ERROR: "No database with this name — check CRM_DB_NAME.",
    ER_NO_SUCH_TABLE: "Table not found — check CRM_LEADS_TABLE.",
    ER_BAD_FIELD_ERROR: "No columns found — check the CRM_COL_* mapping.",
    ETIMEDOUT: "Connection timeout — enable Remote MySQL in Hostinger and whitelist your IP.",
    ECONNREFUSED: "Server refused the connection — check host and port.",
    ENOTFOUND: "Host not found — check CRM_DB_HOST (not localhost; something like srv123.hstgr.io).",
    ER_HOST_NOT_PRIVILEGED: "Your IP is not allowed — add it under Remote MySQL in Hostinger.",
  };
  let msg = map[err?.code] || err?.sqlMessage || err?.message || "Could not connect to CRM";
  /* Kis user / kis IP se mana hua — MySQL batata hai, wahi dikha do (password nahi hota isme) */
  if (err?.code === "ER_ACCESS_DENIED_ERROR" && err?.sqlMessage) {
    const who = String(err.sqlMessage).match(/'([^']*)'@'([^']*)'/);
    if (who) msg = `CRM database refused user "${who[1]}" from IP ${who[2]} — either the password is wrong or this IP is not allowed in Hostinger → Remote MySQL.`;
  }
  const e = new Error(msg);
  e.code = err?.code;
  e.friendly = true;
  return e;
}

/* ---------- connection test ---------- */
export async function testConnection() {
  const cfg = crmConfig();
  let conn;
  try {
    conn = await connect();
    const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM ${safeIdent(cfg.table)}`);
    const total = rows[0]?.n || 0;

    /* Kaunse stage/status hain — user ko dikhana zaroori hai taaki wo
       CRM_LOST_STATUS sahi bhar sake.

       Do tarah ke CRM hote hain:
         A. status seedha leads table me ek column me
         B. stage alag table me, leads se stage_id se juda (JOIN)
       Dono support karte hain. */
    let statuses = [];
    try {
      if (cfg.useStageTable) {
        const [s] = await conn.query(
          `SELECT st.${safeIdent(cfg.stage.label)} AS s, COUNT(l.${safeIdent(cfg.col.id)}) AS n
           FROM ${safeIdent(cfg.stage.table)} st
           LEFT JOIN ${safeIdent(cfg.table)} l
             ON l.${safeIdent(cfg.stage.leadFk)} = st.${safeIdent(cfg.stage.id)}
           GROUP BY st.${safeIdent(cfg.stage.id)}, st.${safeIdent(cfg.stage.label)}
           ORDER BY n DESC LIMIT 40`,
        );
        statuses = s.map((r) => ({ status: r.s, count: Number(r.n) }));
      } else {
        const [s] = await conn.query(
          `SELECT ${safeIdent(cfg.col.status)} AS s, COUNT(*) AS n
           FROM ${safeIdent(cfg.table)}
           GROUP BY ${safeIdent(cfg.col.status)} ORDER BY n DESC LIMIT 25`,
        );
        statuses = s.map((r) => ({ status: r.s, count: Number(r.n) }));
      }
    } catch { /* column ya table ka naam galat ho sakta hai */ }

    const lostCount = await countLost(conn, cfg);

    return { ok: true, table: cfg.table, total: Number(total), statuses, lostCount };
  } catch (err) {
    throw friendlyError(err);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

async function countLost(conn, cfg) {
  try {
    const ph = cfg.lostValues.map(() => "?").join(",");
    if (cfg.useStageTable) {
      const [rows] = await conn.execute(
        `SELECT COUNT(*) AS n
         FROM ${safeIdent(cfg.table)} l
         JOIN ${safeIdent(cfg.stage.table)} st
           ON l.${safeIdent(cfg.stage.leadFk)} = st.${safeIdent(cfg.stage.id)}
         WHERE st.${safeIdent(cfg.stage.label)} IN (${ph})`,
        cfg.lostValues,
      );
      return Number(rows[0]?.n || 0);
    }
    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS n FROM ${safeIdent(cfg.table)} WHERE ${safeIdent(cfg.col.status)} IN (${ph})`,
      cfg.lostValues,
    );
    return Number(rows[0]?.n || 0);
  } catch { return null; }
}

/* ---------- table ka structure ---------- */
export async function describeTable() {
  const cfg = crmConfig();
  let conn;
  try {
    conn = await connect();
    const [cols] = await conn.query(`SHOW COLUMNS FROM ${safeIdent(cfg.table)}`);
    return {
      ok: true,
      table: cfg.table,
      columns: cols.map((c) => ({ name: c.Field, type: c.Type, nullable: c.Null === "YES" })),
    };
  } catch (err) {
    throw friendlyError(err);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

/* ---------- lost leads ---------- */
export async function fetchLostLeads({ since, limit = 500 } = {}) {
  const cfg = crmConfig();
  let conn;

  try {
    conn = await connect();
    const c = cfg.col;

    /* Stage table wale CRM me leads ko alias "l" milta hai, warna
       koi alias nahi — dono case ke liye prefix alag rakha hai. */
    const P = cfg.useStageTable ? "l." : "";

    /* Sirf wahi columns maango jo .env me set hain — jo khaali hai
       usko SELECT me daalne se "Unknown column" error aata hai. */
    const parts = [
      `${P}${safeIdent(c.id)} AS crm_id`,
      `${P}${safeIdent(c.name)} AS name`,
      `${P}${safeIdent(c.phone)} AS phone`,
    ];

    const optional = [
      [c.email, "email"], [c.city, "city"], [c.service, "service"],
      [c.reason, "reason"], [c.quoted, "quoted"], [c.campaign, "campaign"],
      [c.lostAt, "lost_at"],
      [c.pipeline, "pipeline_id"], [c.stageId, "stage_id"],
    ];
    for (const [col, alias] of optional) {
      if (col) parts.push(`${P}${safeIdent(col)} AS ${alias}`);
    }

    /* Staff — table hai to naam laao, warna jo bhi column me hai wahi */
    if (cfg.useStaffTable) {
      parts.push(`u.${safeIdent(cfg.staff.name)} AS staff`);
    } else if (c.staff) {
      parts.push(`${P}${safeIdent(c.staff)} AS staff`);
    }

    const ph = cfg.lostValues.map(() => "?").join(",");
    let sql;
    const params = [...cfg.lostValues];

    if (cfg.useStageTable) {
      /* Stage ka label bhi laate hain — bucket wahi se banta hai.
         Yahi is CRM me "lost reason" ka kaam karta hai. */
      parts.push(`st.${safeIdent(cfg.stage.label)} AS stage_label`);

      /* LEFT JOIN — jis lead pe koi assign nahi hai wo bhi aani chahiye,
         warna unassigned leads chhoot jaayengi. */
      const staffJoin = cfg.useStaffTable
        ? ` LEFT JOIN ${safeIdent(cfg.staff.table)} u ON l.${safeIdent(cfg.staff.leadFk)} = u.${safeIdent(cfg.staff.id)}`
        : "";

      sql = `SELECT ${parts.join(", ")}
             FROM ${safeIdent(cfg.table)} l
             JOIN ${safeIdent(cfg.stage.table)} st
               ON l.${safeIdent(cfg.stage.leadFk)} = st.${safeIdent(cfg.stage.id)}${staffJoin}
             WHERE st.${safeIdent(cfg.stage.label)} IN (${ph})`;
    } else {
      parts.push(`${safeIdent(c.status)} AS status`);
      const staffJoin2 = cfg.useStaffTable
        ? ` LEFT JOIN ${safeIdent(cfg.staff.table)} u ON ${safeIdent(cfg.table)}.${safeIdent(cfg.staff.leadFk)} = u.${safeIdent(cfg.staff.id)}`
        : "";
      sql = `SELECT ${parts.join(", ")}
             FROM ${safeIdent(cfg.table)}${staffJoin2}
             WHERE ${safeIdent(c.status)} IN (${ph})`;
    }

    /* Incremental sync — pichli baar ke baad wali hi laao */
    if (since && c.lostAt) {
      sql += ` AND ${P}${safeIdent(c.lostAt)} >= ?`;
      params.push(since);
    }
    if (c.lostAt) sql += ` ORDER BY ${P}${safeIdent(c.lostAt)} DESC`;
    sql += ` LIMIT ${Math.min(Number(limit) || 500, 5000)}`;

    const [rows] = await conn.execute(sql, params);
    return { ok: true, rows, count: rows.length };
  } catch (err) {
    throw friendlyError(err);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

/* ---------- Lead Report ----------
   Ek date range me CRM me jitni leads BANI (created_at), wo sab — har lead
   abhi kis stage pe hai, kis staff ke paas, kaunsi service / source /
   campaign. Baaki saare filter (stage, keyword, staff…) browser me hote
   hain, taaki har click pe database na chhedna pade.

   Jawab chhota rakhne ke liye (Vercel ~4.5 MB tak hi bhejta hai) baar-baar
   aane wale naam (stage, staff, service…) ek "dict" me, aur har lead me
   sirf unka number. Sirf SELECT — CRM me kuch nahi badalta. */
export async function fetchLeadReport({ from, to, limit = 35000 } = {}) {
  const cfg = crmConfig();
  let conn;
  try {
    conn = await connect();
    const c = cfg.col;
    const [colsRaw] = await conn.query(`SHOW COLUMNS FROM ${safeIdent(cfg.table)}`);
    const have = new Set(colsRaw.map((x) => x.Field));
    const pick = (...names) => names.find((x) => x && have.has(x)) || "";

    const created = pick(process.env.CRM_COL_CREATED, "created_at", "created", "date_added", "added_on");
    if (!created) throw new Error(`No created-date column found in "${cfg.table}" — set CRM_COL_CREATED in .env.`);
    const updated = pick(process.env.CRM_COL_UPDATED, "updated_at");

    const L = (col) => `l.${safeIdent(col)}`;
    const cols = {
      id: pick(c.id, "id"),
      name: pick(c.name, "name"),
      phone: pick(c.phone, "phone"),
      email: pick(c.email, "email"),
      service: pick(c.service, "service"),
      source: pick(process.env.CRM_COL_SOURCE, "source"),
      channel: pick(process.env.CRM_COL_CHANNEL, "channel"),
      campaign: pick(c.campaign, "campaign"),
      city: pick(c.city, "district", "city"),
      state: pick(process.env.CRM_COL_STATE_NAME, "state"),
      deal: pick(c.quoted, "deal_value"),
      status: pick(c.status, "status"),
      pipelineId: pick(c.pipeline, "pipeline_id"),
      staffId: pick(cfg.staff.leadFk, c.staff, "assigned_to"),
    };

    const parts = [`DATE_FORMAT(${L(created)}, '%Y-%m-%d %H:%i:%s') AS created_at`];
    if (updated) parts.push(`DATE_FORMAT(${L(updated)}, '%Y-%m-%d %H:%i:%s') AS updated_at`);
    Object.entries(cols).forEach(([alias, col]) => { if (col) parts.push(`${L(col)} AS \`${alias}\``); });

    let joins = "";
    const stageFk = pick(cfg.stage.leadFk, c.stageId, "stage_id");
    if (cfg.useStageTable && stageFk) {
      parts.push(`st.${safeIdent(cfg.stage.label)} AS stage`);
      joins += ` LEFT JOIN ${safeIdent(cfg.stage.table)} st ON ${L(stageFk)} = st.${safeIdent(cfg.stage.id)}`;
    }
    if (cfg.useStaffTable && cols.staffId) {
      parts.push(`u.${safeIdent(cfg.staff.name)} AS staff`);
      joins += ` LEFT JOIN ${safeIdent(cfg.staff.table)} u ON ${L(cols.staffId)} = u.${safeIdent(cfg.staff.id)}`;
    }

    const where = [];
    const params = [];
    if (from) { where.push(`${L(created)} >= ?`); params.push(`${from} 00:00:00`); }
    if (to) {
      const d = new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
      where.push(`${L(created)} < ?`); params.push(`${d.toISOString().slice(0, 10)} 00:00:00`);
    }
    const cap = Math.min(Math.max(Number(limit) || 35000, 100), 35000);
    const sql = `SELECT ${parts.join(", ")} FROM ${safeIdent(cfg.table)} l${joins}
                 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY ${L(created)} DESC LIMIT ${cap + 1}`;
    const [raw] = await conn.execute(sql, params);
    const truncated = raw.length > cap;
    const rows = truncated ? raw.slice(0, cap) : raw;

    /* Pipeline ke naam + stages ka sahi order (jaisa CRM me dikhta hai) */
    let pipelines = {};
    try {
      const [p] = await conn.query(`SELECT id, name FROM ${safeIdent(process.env.CRM_PIPELINE_TABLE || "pipelines")}`);
      p.forEach((x) => { pipelines[x.id] = x.name; });
    } catch { pipelines = {}; }
    let stages = [];
    if (cfg.useStageTable) {
      try {
        const [s] = await conn.query(`SELECT * FROM ${safeIdent(cfg.stage.table)}`);
        stages = s
          .map((x) => ({ label: String(x[cfg.stage.label] ?? "").trim(), pipeline: pipelines[x.pipeline_id] || "", sort: Number(x.sort ?? 0), pid: Number(x.pipeline_id ?? 0), id: Number(x[cfg.stage.id] ?? 0) }))
          .filter((x) => x.label)
          .sort((a, b) => a.pid - b.pid || a.sort - b.sort || a.id - b.id)
          .map(({ label, pipeline }) => ({ label, pipeline }));
      } catch { stages = []; }
    }

    /* Baar-baar aane wale naam → number */
    const dict = { stage: [], staff: [], service: [], source: [], campaign: [], pipeline: [], state: [] };
    const idx = {};
    const ref = (k, v) => {
      const s = String(v ?? "").trim();
      if (!s) return -1;
      const m = idx[k] || (idx[k] = new Map());
      if (!m.has(s)) { m.set(s, dict[k].length); dict[k].push(s); }
      return m.get(s);
    };
    const out = rows.map((r) => {
      const stage = r.stage != null ? r.stage : r.status;
      const src = [r.source, r.channel && r.channel !== r.source ? r.channel : ""].filter(Boolean).join(" · ");
      return [
        r.id, r.created_at || "", r.name || "", r.phone || "", r.email || "",
        ref("stage", stage), ref("staff", r.staff != null ? r.staff : (r.staffId ? `#${r.staffId}` : "")),
        ref("service", r.service), ref("source", src), ref("campaign", r.campaign),
        ref("pipeline", pipelines[r.pipelineId] || ""), Number(r.deal || 0) || 0,
        r.updated_at || "", r.city || "", ref("state", r.state),
      ];
    });

    let total = out.length;
    if (truncated) {
      try {
        const [n] = await conn.execute(`SELECT COUNT(*) AS n FROM ${safeIdent(cfg.table)} l ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`, params);
        total = Number(n[0]?.n || out.length);
      } catch { /* */ }
    }

    return {
      ok: true,
      fields: ["id", "created", "name", "phone", "email", "stage", "staff", "service", "source", "campaign", "pipeline", "deal", "updated", "city", "state"],
      rows: out, dict, stages, truncated, total,
      lostValues: cfg.lostValues,
    };
  } catch (err) {
    throw friendlyError(err);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}