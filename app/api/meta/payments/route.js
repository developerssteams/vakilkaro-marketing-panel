import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchAccountPayments, fetchPrepaidBalance, fetchAccountDetails } from "../../../../lib/meta-api";
import { pool } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   WALLET API — GET /api/meta/payments?key=<WALLET_API_KEY>
   Ad Wallet ka data bahar ke system (CRM, Sheet, report) ke liye.
   Sirf padhna — kuch badalta nahi. Login nahi, API key chahiye
   (.env / Vercel: WALLET_API_KEY):
     Header  x-api-key: <key>   (ya)  Authorization: Bearer <key>
     ya URL  ?key=<key>
   Query (optional): from=2026-10-01  to=2026-10-31  account=act_123  refresh=1
   Jawab: accounts[] (balance, lifetime spend, period ka funded/paid),
          payments[] (history), totals
   Neeche wala POST panel ka apna hai — wo pehle jaisa hi hai.
   ============================================================ */

const CACHE = new Map();          /* key → { at, body } */
const TTL = 5 * 60000;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "x-api-key, authorization, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };

const json = (body, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
const day = /^\d{4}-\d{2}-\d{2}$/;
const istDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

function keyOk(request, url) {
  const want = String(process.env.WALLET_API_KEY || "").trim().replace(/^(["'])(.*)\1$/, "$2");
  const auth = request.headers.get("authorization") || "";
  const got = String(request.headers.get("x-api-key") || (auth.startsWith("Bearer ") ? auth.slice(7) : "") || url.searchParams.get("key") || "").trim();
  if (!want || !got) return false;
  const a = Buffer.from(want); const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Payment ka seedha naam — Ad Wallet ke "Status" column jaisa */
function statusOf(p) {
  if (p.metaStatus) return p.metaStatus;                       /* Funded / Paid / Failed / Refunded */
  if (String(p.status) === "Cancelled") return "Failed";
  if (String(p.type) === "Refund") return "Refunded";
  return String(p.type) === "Credit" ? "Funded" : "Paid";
}

/* Panel me haath se daali wallet entries (shared database se) */
async function manualEntries(from, to, accountNames) {
  if (!process.env.DATABASE_URL) return [];
  try {
    const r = await pool.query("SELECT data FROM panel_rows WHERE ds = 'ad-wallet__ledger' AND deleted = false");
    return r.rows.map((x) => x.data || {})
      .filter((e) => e.source !== "Meta Billing" && String(e.date || "") >= from && String(e.date || "") <= to)
      .filter((e) => !accountNames || accountNames.has(String(e.accountId || "")) || accountNames.has(String(e.account || "")))
      .map((e) => ({
        date: String(e.date || ""), time: e.time || "",
        accountId: e.accountId || "", accountName: e.account || "",
        status: e.status === "Cancelled" ? "Failed" : e.type === "Refund" ? "Refunded" : e.type === "Credit" ? "Funded" : "Paid",
        type: e.type || "", method: e.payMode || e.method || "", amount: r2(e.amount),
        reference: e.reference || "", note: e.note || "", source: "Manual",
      }));
  } catch { return []; }
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function GET(request) {
  const url = new URL(request.url);
  if (!process.env.WALLET_API_KEY) return json({ ok: false, error: "WALLET_API_KEY is not set on the server" }, 503);
  if (!keyOk(request, url)) return json({ ok: false, error: "Invalid or missing API key" }, 401);
  const cfg = metaConfig();
  if (!cfg.ready) return json({ ok: false, error: "Meta is not connected (META_SYSTEM_USER_TOKEN)" }, 503);

  const today = istDay(Date.now());
  const from = day.test(url.searchParams.get("from") || "") ? url.searchParams.get("from") : istDay(Date.now() - 89 * 86400000);
  const to = day.test(url.searchParams.get("to") || "") ? url.searchParams.get("to") : today;
  if (from > to) return json({ ok: false, error: "'from' must be before 'to'" }, 400);
  const one = String(url.searchParams.get("account") || "").trim();
  const ids = one
    ? [/^act_\d{6,20}$/.test(one) ? one : /^\d{6,20}$/.test(one) ? `act_${one}` : ""].filter(Boolean)
    : [...new Set(cfg.accountIds || [])].slice(0, 25);
  if (!ids.length) return json({ ok: false, error: one ? "Bad account id — use act_123456789" : "No ad accounts set (META_AD_ACCOUNT_IDS)" }, 400);

  const ck = `${ids.join(",")}|${from}|${to}`;
  const hit = CACHE.get(ck);
  if (hit && url.searchParams.get("refresh") !== "1" && Date.now() - hit.at < TTL) return json({ ...hit.body, cached: true });

  const accounts = []; const payments = []; const errors = [];
  for (const id of ids) {
    try {
      const [acc, pre, pay] = await Promise.all([
        fetchAccountDetails(id),
        fetchPrepaidBalance(id),
        fetchAccountPayments(id, from).catch((e) => { errors.push({ account: id, part: "payments", message: e?.message || "failed" }); return { payments: [] }; }),
      ]);
      const mine = (pay.payments || []).filter((p) => p.date >= from && p.date <= to).map((p) => ({
        date: p.date, time: p.time || "", accountId: id, accountName: acc.name,
        status: statusOf(p), type: p.type, method: p.method || p.payMode || "", amount: r2(p.amount),
        reference: p.txId || "", note: p.reason || "", source: "Meta",
      }));
      const sum = (s) => r2(mine.filter((p) => p.status === s).reduce((a, p) => a + p.amount, 0));
      accounts.push({
        accountId: id, name: acc.name, status: acc.status, active: acc.active, currency: acc.currency,
        business: acc.bmName || "", problem: acc.problem || "",
        lifetimeSpend: r2(acc.amountSpent),
        prepaidBalance: pre.prepaid,                      /* null = card wala (postpaid) account */
        fundingSource: pre.display || "",
        unbilled: r2(acc.balance),                        /* card wale account me abhi tak ka bill */
        spendLimit: r2(acc.spendCap),
        period: { funded: sum("Funded"), paid: sum("Paid"), failed: sum("Failed"), refunded: sum("Refunded"), payments: mine.length },
      });
      payments.push(...mine);
    } catch (e) { errors.push({ account: id, message: e?.message || "failed" }); }
  }

  const names = new Set(accounts.flatMap((a) => [a.accountId, a.name]));
  payments.push(...(await manualEntries(from, to, one ? names : null)));
  payments.sort((a, b) => String(b.time || b.date).localeCompare(String(a.time || a.date)));
  const tot = (s) => r2(payments.filter((p) => p.status === s).reduce((a, p) => a + p.amount, 0));

  const body = {
    ok: true, generatedAt: new Date().toISOString(), from, to,
    currency: accounts[0]?.currency || "INR",
    totals: {
      funded: tot("Funded"), paid: tot("Paid"), failed: tot("Failed"), refunded: tot("Refunded"),
      payments: payments.length,
      prepaidBalance: r2(accounts.reduce((a, x) => a + (x.prepaidBalance || 0), 0)),
      lifetimeSpend: r2(accounts.reduce((a, x) => a + x.lifetimeSpend, 0)),
    },
    accounts, payments, errors,
  };
  if (!errors.length || accounts.length) CACHE.set(ck, { at: Date.now(), body });
  return json(body);
}


/* POST { accountIds: ["act_1"], since: "2025-10-01" } → Meta billing history */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const ids = [...new Set((d.accountIds || []).map(String).filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
  if (!ids.length) return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(d.since || "")) ? d.since : "";

  const payments = []; const errors = []; const sources = {}; const balances = {};
  for (const id of ids) {
    balances[id] = await fetchPrepaidBalance(id);
    try {
      const r = await fetchAccountPayments(id, since);
      sources[id] = r.source;
      payments.push(...r.payments.map((p) => ({ ...p, account: id })));
    } catch (e) { errors.push({ account: id, message: e?.message || "failed" }); }
  }
  return NextResponse.json({ ok: true, payments, errors, sources, balances });
}