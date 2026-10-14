/* ============================================================
   lib/message-queue.js  —  SERVER ONLY

   Broadcast aur Journey ke messages yahan queue hote hain, phir
   dheere-dheere bhejte hain.

   Seedha loop me 500 message bhejna do wajah se galat hai:
     1. Meta rate-limit maar deta hai
     2. Naye number par ek saath bahut message = quality gir jaati
        hai, aur number ban ho sakta hai

   Isliye throttle laga hai — per minute utne hi jaate hain jitne
   .env me set hain.

   Storage disk par JSON hai taaki server restart ho to queue na
   ude. Read-only host par memory par chalta hai.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "wa-queue.json");
const LOG_FILE = path.join(DIR, "wa-log.json");
const MAX_QUEUE = 5000;
const MAX_LOG = 2000;

let memQueue = [];
let memLog = [];
let diskOk = true;

function read(file, fallback) {
  if (!diskOk) return fallback;
  try {
    if (!fs.existsSync(file)) return [];
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch { return fallback; }
}

function write(file, rows, which) {
  if (which === "queue") memQueue = rows; else memLog = rows;
  if (!diskOk) return;
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows), "utf8");
  } catch { diskOk = false; }
}

const readQueue = () => read(FILE, memQueue);
const writeQueue = (r) => write(FILE, r, "queue");
const readLog = () => read(LOG_FILE, memLog);
const writeLog = (r) => write(LOG_FILE, r, "log");

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

/* ---------- queue me daalo ---------- */
export function enqueue(jobs) {
  const rows = readQueue();
  const now = new Date().toISOString();
  const added = [];

  for (const j of jobs) {
    /* Ek hi lead ko ek hi campaign se do baar message na jaye —
       double-click ya dobara run karne se duplicate ban jaate hain. */
    const dup = rows.find((r) =>
      r.phone === j.phone && r.sourceId === j.sourceId && ["queued", "sending"].includes(r.status));
    if (dup) continue;

    added.push({
      id: uid(),
      phone: j.phone,
      leadId: j.leadId || "",
      leadName: j.leadName || "",
      templateName: j.templateName,
      language: j.language || "en",
      variables: j.variables || [],
      buttonUrlParam: j.buttonUrlParam || "",
      source: j.source || "broadcast",      // broadcast | journey | queue-reminder
      sourceId: j.sourceId || "",           // kis broadcast/journey se
      sourceName: j.sourceName || "",
      attempts: 0,
      status: "queued",
      error: "",
      messageId: "",
      queuedAt: now,
      sentAt: "",
    });
  }

  writeQueue([...rows, ...added].slice(-MAX_QUEUE));
  return { queued: added.length, skipped: jobs.length - added.length };
}

/* ---------- bhejne ke liye agla batch ---------- */
export function nextBatch(limit) {
  return readQueue().filter((r) => r.status === "queued").slice(0, limit);
}

export function markSending(ids) {
  const rows = readQueue();
  writeQueue(rows.map((r) => (ids.includes(r.id) ? { ...r, status: "sending" } : r)));
}

export function markSent(id, messageId) {
  const rows = readQueue();
  const row = rows.find((r) => r.id === id);
  writeQueue(rows.map((r) => (r.id === id
    ? { ...r, status: "sent", messageId, sentAt: new Date().toISOString(), error: "" } : r)));
  if (row) pushLog({ ...row, status: "sent", messageId, sentAt: new Date().toISOString() });
}

/* Permanent error par retry ka fayda nahi — jaise number WhatsApp
   par hai hi nahi. Temporary par 3 baar try karte hain. */
export function markFailed(id, message, permanent = false) {
  const rows = readQueue();
  const row = rows.find((r) => r.id === id);
  if (!row) return;

  const attempts = row.attempts + 1;
  const dead = permanent || attempts >= 3;

  writeQueue(rows.map((r) => (r.id === id
    ? { ...r, status: dead ? "failed" : "queued", attempts, error: message } : r)));

  if (dead) pushLog({ ...row, status: "failed", error: message, sentAt: new Date().toISOString() });
}

function pushLog(entry) {
  const rows = readLog();
  writeLog([{
    id: entry.id, phone: entry.phone, leadId: entry.leadId, leadName: entry.leadName,
    templateName: entry.templateName, source: entry.source, sourceId: entry.sourceId,
    sourceName: entry.sourceName, status: entry.status, messageId: entry.messageId || "",
    error: entry.error || "", sentAt: entry.sentAt,
    delivered: false, read: false, replied: false,
  }, ...rows].slice(0, MAX_LOG));
}

/* ---------- webhook se status update ---------- */
export function updateStatus(messageId, status) {
  const rows = readLog();
  let hit = false;
  const next = rows.map((r) => {
    if (r.messageId !== messageId) return r;
    hit = true;
    if (status === "delivered") return { ...r, delivered: true };
    if (status === "read") return { ...r, delivered: true, read: true };
    if (status === "failed") return { ...r, status: "failed" };
    return r;
  });
  if (hit) writeLog(next);
  return hit;
}

export function markReplied(phone) {
  const rows = readLog();

  /* Ek number ko kai broadcast gaye ho sakte hain. Reply hamesha
     SABSE HAAL KE message ka jawab hota hai — isliye latest sent
     entry par attribute karte hain, pehli par nahi. */
  const mine = rows
    .filter((r) => r.phone === phone && r.status === "sent")
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));

  const target = mine[0];
  if (!target) return null;

  writeLog(rows.map((r) => (r.id === target.id ? { ...r, replied: true } : r)));
  return { ...target, replied: true };   // kis broadcast/journey ka reply hai
}

/* ---------- panel ke liye ---------- */
export function queueStats() {
  const rows = readQueue();
  const log = readLog();
  return {
    queued: rows.filter((r) => r.status === "queued").length,
    sending: rows.filter((r) => r.status === "sending").length,
    sent: log.filter((r) => r.status === "sent").length,
    failed: log.filter((r) => r.status === "failed").length,
    delivered: log.filter((r) => r.delivered).length,
    read: log.filter((r) => r.read).length,
    replied: log.filter((r) => r.replied).length,
  };
}

/* Har broadcast ka apna counter — panel me delivery report isse banti hai. */
export function statsBySource(sourceId) {
  const log = readLog().filter((r) => r.sourceId === sourceId);
  const pending = readQueue().filter((r) => r.sourceId === sourceId && ["queued", "sending"].includes(r.status)).length;
  return {
    sent: log.filter((r) => r.status === "sent").length,
    delivered: log.filter((r) => r.delivered).length,
    read: log.filter((r) => r.read).length,
    replied: log.filter((r) => r.replied).length,
    failed: log.filter((r) => r.status === "failed").length,
    pending,
  };
}

export function recentLog(limit = 100) { return readLog().slice(0, limit); }

export function clearQueue(sourceId) {
  const rows = readQueue();
  const next = sourceId
    ? rows.filter((r) => !(r.sourceId === sourceId && r.status === "queued"))
    : rows.filter((r) => r.status !== "queued");
  const removed = rows.length - next.length;
  writeQueue(next);
  return { removed };
}
