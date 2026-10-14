#!/usr/bin/env node
/* ============================================================
   npm run wa-tunnel  — apne computer se server ke WhatsApp
   database tak surakshit raasta (SSH tunnel).

   Panel local pe chalta hai, database server (VPS) pe. Ye command
   server ka Postgres (5432) aapke computer ke 127.0.0.1:5433 pe
   le aata hai. Window khuli rakho — band karte hi connection band.

   Pehli baar server ka SSH address poochta hai aur .env.local me
   WA_SSH=user@host likh deta hai. Agli baar seedha chalta hai.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const envLocal = path.join(root, ".env.local");

function readVar(file, key) {
  try {
    const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : "";
  } catch { return ""; }
}

function start(target) {
  console.log(`\n  WhatsApp database tunnel → ${target}`);
  console.log("  Password maange to SERVER ka SSH password daalo.");
  console.log("  Connect hone ke baad screen khaali rahegi — ye normal hai. Ye window KHULI rakho.\n");
  const p = spawn("ssh", ["-N", "-o", "ServerAliveInterval=30", "-o", "ExitOnForwardFailure=yes", "-L", "5433:127.0.0.1:5432", target], { stdio: "inherit" });
  p.on("error", (e) => {
    console.error(`\n  ssh nahi chala: ${e.message}`);
    console.error("  Windows 10/11: Settings → Apps → Optional features → 'OpenSSH Client' install karo.\n");
  });
  p.on("exit", (code) => console.log(`\n  Tunnel band ho gaya (code ${code}). Dobara: npm run wa-tunnel\n`));
}

const saved = process.env.WA_SSH || readVar(envLocal, "WA_SSH") || readVar(path.join(root, ".env"), "WA_SSH");
if (saved) start(saved);
else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const def = "root@whatsapp-ai.vakilkaro.com";
  rl.question(`\n  Server ka SSH login (user@host ya user@IP) [${def}]: `, (ans) => {
    rl.close();
    const target = (ans || def).trim();
    try { fs.appendFileSync(envLocal, `\n# npm run wa-tunnel isi se server pe judta hai\nWA_SSH=${target}\n`); console.log("  .env.local me WA_SSH save ho gaya."); } catch { /* */ }
    start(target);
  });
}
