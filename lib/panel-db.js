/* ============================================================
   lib/panel-db.js — SERVER ONLY

   Panel ka saara data (campaigns, daily stats, leads, wallet,
   settings…) ab ek shared database table me — taaki har computer
   aur har staff ko ek jaisa data dikhe. Pehle ye sirf browser me
   rehta tha.

   Ek hi table: panel_rows
     ds   = dataset (jaise "campaigns__daily-stats")
     id   = row ki id
     data = poori row (JSON)
     seq  = har badlav pe naya number — browser "seq > X" maang ke
            sirf naye badlav le leta hai
   Table pehli call pe apne aap ban jaati hai (DATABASE_URL wala DB).
   ============================================================ */
import { pool } from "./db";

let ready = null;

export function panelDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function ensurePanelTable() {
  if (!ready) {
    ready = pool.query(`
      CREATE SEQUENCE IF NOT EXISTS panel_rows_seq;
      CREATE TABLE IF NOT EXISTS panel_rows (
        ds         text        NOT NULL,
        id         text        NOT NULL,
        data       jsonb,
        pos        integer     NOT NULL DEFAULT 0,
        deleted    boolean     NOT NULL DEFAULT false,
        seq        bigint      NOT NULL DEFAULT nextval('panel_rows_seq'),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text,
        PRIMARY KEY (ds, id)
      );
      CREATE INDEX IF NOT EXISTS panel_rows_seq_idx ON panel_rows (seq);
    `).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/* Naye / badle rows likho. Ek batch me ek id do baar ho to aakhri wali. */
export async function upsertRows(ds, rows, by) {
  if (!rows.length) return 0;
  const seen = new Map();
  rows.forEach((r, i) => { if (r && r.id) seen.set(String(r.id), { id: String(r.id), data: r.data ?? null, pos: Number.isFinite(r.pos) ? r.pos : i }); });
  const list = [...seen.values()];
  await pool.query(
    `INSERT INTO panel_rows (ds, id, data, pos, deleted, seq, updated_at, updated_by)
     SELECT $1, x.id, x.data, x.pos, false, nextval('panel_rows_seq'), now(), $3
       FROM jsonb_to_recordset($2::jsonb) AS x(id text, data jsonb, pos integer)
     ON CONFLICT (ds, id) DO UPDATE
       SET data = EXCLUDED.data, pos = EXCLUDED.pos, deleted = false,
           seq = EXCLUDED.seq, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [ds, JSON.stringify(list), by || ""],
  );
  return list.length;
}

/* Delete = row pe "deleted" ka nishaan, taaki baaki computer bhi use hata dein */
export async function deleteRows(ds, ids, by) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!list.length) return 0;
  const r = await pool.query(
    `UPDATE panel_rows SET deleted = true, data = NULL, seq = nextval('panel_rows_seq'), updated_at = now(), updated_by = $3
      WHERE ds = $1 AND id = ANY($2::text[]) AND deleted = false`,
    [ds, list, by || ""],
  );
  return r.rowCount || 0;
}

/* seq ke baad ke saare badlav. Badi list tukdon me (limit). */
export async function changesSince(since, limit = 1500) {
  const r = await pool.query(
    `SELECT ds, id, data, deleted, pos, seq FROM panel_rows WHERE seq > $1 ORDER BY seq LIMIT $2`,
    [Math.max(0, Number(since) || 0), limit],
  );
  return r.rows.map((x) => ({ ds: x.ds, id: x.id, data: x.data, deleted: x.deleted, pos: x.pos, seq: Number(x.seq) }));
}

export async function maxSeq() {
  const r = await pool.query(`SELECT COALESCE(MAX(seq), 0) AS m FROM panel_rows`);
  return Number(r.rows[0]?.m || 0);
}
