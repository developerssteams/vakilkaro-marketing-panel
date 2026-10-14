// ============================================================
//  lib/db.js — PostgreSQL connection pool (node-postgres / pg)
//  Ek hi pool poore app me reuse hota hai (dev hot-reload safe).
// ============================================================
import { Pool } from "pg";

const globalForDb = globalThis;

export const pool =
  globalForDb.__vkPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__vkPool = pool;
}

// Chhota helper — query chalane ke liye
export async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}
