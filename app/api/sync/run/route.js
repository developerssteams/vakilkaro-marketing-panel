import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig, googleConfig } from "../../../../lib/platform-config";
import * as meta from "../../../../lib/meta-api";
import * as google from "../../../../lib/google-ads-api";

/* Sync chalao aur data client ko wapas do.
   Storage abhi browser me hai, isliye server likhta nahi — laakar
   deta hai, aur client apne localStorage me merge kar leta hai.
   Jab DB aayega tab yahin insert ho jayega, route wahi rahega. */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  const provider = String(body.provider || "meta");
  const since = String(body.since || "").slice(0, 10);
  const until = String(body.until || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return NextResponse.json({ error: "Provide since and until as YYYY-MM-DD" }, { status: 400 });
  }
  if (since > until) {
    return NextResponse.json({ error: "since cannot be after until" }, { status: 400 });
  }

  try {
    if (provider === "meta") return NextResponse.json(await runMeta(since, until, body.accountId, body.accountIds));
    if (provider === "google") return NextResponse.json(await runGoogle(since, until, body.accountId));
    return NextResponse.json({ error: "provider must be meta or google" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Sync failed" }, { status: 502 });
  }
}

/* Account list teen jagah se aa sakti hai, is order me:
     1. accountId  — ek hi account (naya add hua to sirf uska sync)
     2. accountIds — panel ke Ad Accounts tab ki list
     3. .env ki META_AD_ACCOUNTS (ya META_AD_ACCOUNT_IDS) — fallback
   Format check zaroori hai — ye ID URL path me jaati hai. */
function cleanIds(list) {
  return [...new Set((list || [])
    .map((x) => String(x || "").trim())
    .map((x) => (x.startsWith("act_") ? x : `act_${x}`))
    .filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
}

async function runMeta(since, until, only, fromPanel) {
  const cfg = metaConfig();
  if (!cfg.ready) {
    return { ok: false, needsSetup: true, provider: "meta",
      message: "META_TOKEN is not set in .env." };
  }
  let ids = only ? cleanIds([only]) : cleanIds(fromPanel);
  if (!ids.length) ids = cleanIds(cfg.accountIds);
  if (!ids.length) {
    return { ok: false, needsSetup: true, provider: "meta",
      message: "No Meta account connected — connect one from Ad Accounts → Connect Meta Account." };
  }

  const campaigns = [];
  const daily = [];
  const errors = [];
  const accounts = [];
  meta.resetUsage();

  /* Ek account fail ho to baaki rukne nahi chahiye — teen accounts me
     se ek ka token kharab ho sakta hai. */
  for (const id of ids) {
    try {
      /* Account ka haal har sync pe — lifetime spend, payment error */
      try { accounts.push(await meta.fetchAccountDetails(id)); } catch { /* optional */ }
      const { campaigns: c, daily: d } = await meta.fetchAccountData(id, since, until);
      campaigns.push(...c.map((x) => ({ ...x, account: id, platform: "Meta" })));
      daily.push(...d.map((x) => ({ ...x, account: id })));
    } catch (e) {
      errors.push({ account: id, message: e?.message || "unknown error" });
    }
  }

  return {
    ok: errors.length < ids.length,
    provider: "meta",
    accountCount: ids.length,
    accounts,
    usage: meta.getUsage(),
    campaigns, daily, errors,
    range: { since, until },
    syncedAt: new Date().toISOString(),
  };
}

async function runGoogle(since, until, only) {
  const cfg = googleConfig();
  if (!cfg.ready) {
    return { ok: false, needsSetup: true, provider: "google",
      message: "Google Ads developer token or refresh token is not set." };
  }
  const ids = only ? [String(only).replace(/-/g, "")] : cfg.customerIds;
  if (!ids.length) {
    return { ok: false, needsSetup: true, provider: "google",
      message: "GOOGLE_ADS_CUSTOMER_IDS is not set in .env." };
  }

  const campaigns = [];
  const daily = [];
  const errors = [];

  for (const id of ids) {
    try {
      const c = await google.fetchCampaigns(id);
      campaigns.push(...c.map((x) => ({ ...x, account: id, platform: "Google Ads", channel: "YouTube" })));
      const d = await google.fetchDailyInsights(id, since, until);
      daily.push(...d.map((x) => ({ ...x, account: id })));
    } catch (e) {
      errors.push({ account: id, message: e?.message || "unknown error" });
    }
  }

  return {
    ok: errors.length < ids.length,
    provider: "google",
    accounts: ids.length,
    campaigns, daily, errors,
    range: { since, until },
    syncedAt: new Date().toISOString(),
  };
}
