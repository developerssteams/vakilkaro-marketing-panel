/* ============================================================
   lib/reply-inbox.js  —  SERVER ONLY

   Customer ka reply kabhi bhi aa sakta hai, par panel tabhi khulta
   hai jab koi login kare. Isliye beech me ye chhota inbox hai —
   reply aayi to yahan rukti hai, panel khulte hi utha li jaati hai.

   Reply sabse keemti signal hai: jisne jawab diya wo interested
   hai. Isliye ise kabhi drop nahi karte.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "wa-replies.json");
const MAX = 500;

let memory = [];
let diskOk = true;

function readAll() {
  if (!diskOk) return memory;
  try {
    if (!fs.existsSync(FILE)) return [];
    const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch { return memory; }
}

function writeAll(rows) {
  memory = rows;
  if (!diskOk) return;
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(rows), "utf8");
  } catch { diskOk = false; }
}

export function pushReply(reply) {
  const rows = readAll();
  /* Same message dobara — Meta kabhi-kabhi retry karta hai */
  if (reply.messageId && rows.some((r) => r.messageId === reply.messageId)) return { added: false };

  writeAll([{ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...reply }, ...rows].slice(0, MAX));
  return { added: true };
}

export function drainReplies() {
  const rows = readAll();
  if (rows.length) writeAll([]);
  return rows;
}

export function replyCount() { return readAll().length; }
