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

export function crmConfig() {
  const host = process.env.CRM_DB_HOST || "";
  const database = process.env.CRM_DB_NAME || "";
  const user = process.env.CRM_DB_USER || "";

  return {
    host,
    port: Number(process.env.CRM_DB_PORT || 3306),
    database,
    user,
    password: process.env.CRM_DB_PASSWORD || "",
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
  const msg = map[err?.code] || err?.sqlMessage || err?.message || "Could not connect to CRM";
  const e = new Error(msg);
  e.code = err?.code;
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
