/* ============================================================
   lib/lead-queue.js  —  SERVER ONLY

   Website se lead kabhi bhi aa sakti hai, par panel tabhi khulta
   hai jab koi login kare. Isliye beech me ek chhota queue rakha
   hai — lead aayi to yahan ruk jaati hai, panel khulte hi utha
   li jaati hai.

   Storage disk par JSON hai taaki server restart ho to leads na
   udein. Disk na likh paaye (read-only host) to memory par chalta
   hai — us case me restart par queue khali ho jayegi.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "website-leads.json");
const MAX = 500;

let memory = [];
let diskOk = true;

function readAll() {
  if (!diskOk) return memory;
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = fs.readFileSync(FILE, "utf8");
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return memory;
  }
}

function writeAll(rows) {
  memory = rows;
  if (!diskOk) return;
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(rows, null, 2), "utf8");
  } catch {
    diskOk = false; // aage se sirf memory
  }
}

export function pushLead(lead) {
  const rows = readAll();
  /* Same number 5 minute me dobara aaya to wo double submit hai,
     nayi lead nahi. */
  const cut = Date.now() - 5 * 60 * 1000;
  const dup = rows.find((r) => r.phone === lead.phone && new Date(r.receivedFullAt).getTime() > cut);
  if (dup) return { queued: false, reason: "duplicate" };

  const next = [{ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...lead }, ...rows].slice(0, MAX);
  writeAll(next);
  return { queued: true };
}

export function drainLeads() {
  const rows = readAll();
  if (rows.length) writeAll([]);
  return rows;
}

export function queueSize() {
  return readAll().length;
}
