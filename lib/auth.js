// ============================================================
//  lib/auth.js — session token + DB-backed authentication
//  Token = base64url(userId) . HMAC-SHA256(payload, secret)
//  Verify se sirf userId nikalta hai; user data DB se aata hai.
// ============================================================
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query, queryOne } from "./db";

export const AUTH_COOKIE = "vakilkaro_session";
const DEFAULT_SECRET = "vakilkaro-local-dev-secret-change-me";

// Built-in local Super Admin. This lets a fresh project log in before
// PostgreSQL users are seeded. Override any value from .env/.env.local.
export const DEFAULT_ADMIN_INTERNAL_ID = 999999999;
/* Vercel me value daalte waqt aksar quotes ("…") ya space bhi chale jaate
   hain — tab sahi password bhi match nahi hota tha. Unhe hata dete hain. */
const envClean = (v) => String(v ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
export const DEFAULT_ADMIN_USER_ID = envClean(process.env.DEFAULT_ADMIN_USER_ID) || "VKADMIN";
export const DEFAULT_ADMIN_EMAIL = envClean(process.env.DEFAULT_ADMIN_EMAIL) || "admin@vakilkaro.com";
export const DEFAULT_ADMIN_PASSWORD = envClean(process.env.DEFAULT_ADMIN_PASSWORD) || "VakilKaro@123";

function defaultAdminUser() {
  return {
    id: DEFAULT_ADMIN_INTERNAL_ID,
    user_code: DEFAULT_ADMIN_USER_ID,
    name: process.env.DEFAULT_ADMIN_NAME || "VakilKaro Admin",
    email: DEFAULT_ADMIN_EMAIL,
    phone: "",
    role_key: "superadmin",
    dept_key: "",
    branch_id: null,
    data_scope: "all",
    status: "active",
    title: "Super Admin",
    color: "#ffcc00",
    role_name: "Super Admin",
    role_icon: "fa-crown",
    role_accent: "#ffcc00",
    branch_name: "",
    branch_code: "",
  };
}

export function authenticateDefaultAdmin(login, password) {
  const l = String(login || "").trim().toLowerCase();
  const p = String(password || "").trim();
  const matchesLogin =
    l === DEFAULT_ADMIN_USER_ID.toLowerCase() ||
    l === DEFAULT_ADMIN_EMAIL.toLowerCase();
  if (!matchesLogin || p !== DEFAULT_ADMIN_PASSWORD) return null;
  return defaultAdminUser();
}

function getSecret() {
  return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

// ---- token sign / verify -----------------------------------
export function createSessionToken(userId) {
  const payload = Buffer.from(String(userId), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, suppliedSig] = token.split(".");
  if (!payload || !suppliedSig) return null;

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(suppliedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const userId = Buffer.from(payload, "base64url").toString("utf8");
    return /^\d+$/.test(userId) ? Number(userId) : null;
  } catch {
    return null;
  }
}

// ---- DB auth ------------------------------------------------
// login = email / phone / user_code se match; password bcrypt verify.
export async function authenticate(login, password) {
  const l = String(login || "").trim();
  const p = String(password || "");
  if (!l || !p) return null;

  const builtIn = authenticateDefaultAdmin(l, p);
  if (builtIn) return builtIn;

  const user = await queryOne(
    `SELECT id, user_code, name, email, phone, password_hash, role_key, dept_key,
            branch_id, data_scope, status, title, color
       FROM users
      WHERE (lower(email) = lower($1) OR phone = $1 OR user_code = $1)
        AND status = 'active'
      LIMIT 1`,
    [l]
  );

  // timing-safe: user na mile to bhi ek hash compute karo
  if (!user) {
    bcrypt.compareSync(p, "$2b$10$usesomesillystringforsalting0000000000000000000000000000");
    return null;
  }

  if (!bcrypt.compareSync(p, user.password_hash)) return null;

  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
  return user;
}

// ---- fetch full user by id (for every page load) -----------
export async function getUserById(id) {
  if (!id) return null;
  if (Number(id) === DEFAULT_ADMIN_INTERNAL_ID) return defaultAdminUser();
  return queryOne(
    `SELECT u.id, u.user_code, u.name, u.email, u.phone, u.role_key, u.dept_key,
            u.branch_id, u.data_scope, u.status, u.title, u.color,
            r.name AS role_name, r.icon AS role_icon, r.accent AS role_accent,
            b.name AS branch_name, b.code AS branch_code
       FROM users u
       LEFT JOIN roles r    ON r.role_key = u.role_key
       LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.id = $1 AND u.status = 'active'
      LIMIT 1`,
    [id]
  );
}

// ---- permissions: resolve none/view/full per module --------
// priority: user_permissions > role_permissions > department_permissions
export async function getPermissions(user) {
  if (!user) return {};
  if (user.role_key === "superadmin") return {};
  const rows = await query(
    `SELECT module_key, level, 3 AS pri FROM user_permissions       WHERE user_id  = $1
     UNION ALL
     SELECT module_key, level, 2 AS pri FROM role_permissions       WHERE role_key = $2
     UNION ALL
     SELECT module_key, level, 1 AS pri FROM department_permissions WHERE dept_key = $3`,
    [user.id, user.role_key, user.dept_key || ""]
  );
  // highest priority wins per module
  const best = {};
  for (const r of rows) {
    const cur = best[r.module_key];
    if (!cur || r.pri > cur.pri) best[r.module_key] = { level: r.level, pri: r.pri };
  }
  const out = {};
  for (const k of Object.keys(best)) out[k] = best[k].level;
  return out; // { dashboard:'full', staff:'full', bank:'view', ... }
}

// ---- session rows (device / ip / time) ---------------------
export async function createSession(userId, { ip, userAgent, device, deviceLabel }) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await query(
    `INSERT INTO sessions (user_id, token_hash, device, device_label, ip, user_agent,
                           login_at, last_seen_at, expires_at, status)
     VALUES ($1,$2,$3,$4,$5,$6, now(), now(), now() + interval '8 hours', 'active')`,
    [userId, tokenHash, device || "desktop", deviceLabel || "", ip || "", (userAgent || "").slice(0, 255)]
  );
  return token;
}

export async function logAudit(event, { userId, loginInput, ip, userAgent, device }) {
  await query(
    `INSERT INTO login_audit (user_id, event, login_input, device, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId || null, event, (loginInput || "").slice(0, 190), device || "", ip || "", (userAgent || "").slice(0, 255)]
  );
}

// ---- simple rate limit (per login input) -------------------
export async function rateAllow(key, maxHits, windowSec) {
  const rk = `pwlogin:${key}`.slice(0, 140);
  const row = await queryOne(`SELECT hits, window_start FROM rate_limits WHERE rk = $1`, [rk]);
  const now = Date.now();
  if (!row) {
    await query(`INSERT INTO rate_limits (rk, hits, window_start) VALUES ($1, 1, now())`, [rk]);
    return true;
  }
  const started = new Date(row.window_start).getTime();
  if (now - started > windowSec * 1000) {
    await query(`UPDATE rate_limits SET hits = 1, window_start = now() WHERE rk = $1`, [rk]);
    return true;
  }
  if (row.hits >= maxHits) return false;
  await query(`UPDATE rate_limits SET hits = hits + 1 WHERE rk = $1`, [rk]);
  return true;
}

export async function rateClear(key) {
  const rk = `pwlogin:${key}`.slice(0, 140);
  await query(`DELETE FROM rate_limits WHERE rk = $1`, [rk]);
}

// device guess from user-agent
export function guessDevice(ua = "") {
  const s = ua.toLowerCase();
  if (/mobile|iphone|android/.test(s)) return "mobile";
  if (/ipad|tablet/.test(s)) return "tablet";
  return "desktop";
}
