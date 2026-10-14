/* ============================================================
   lib/sync-providers.js  —  SERVER ONLY

   Token yahan se bahar nahi jaata. Client sirf normalized rows
   dekhta hai, kabhi token nahi — warna browser me leak ho jaata
   aur koi bhi tumhare ad account se paisa kharch kar sakta tha.

   Token na ho to provider "notConfigured" lautata hai aur UI
   bata deta hai ki .env me kya daalna hai. Isliye poora flow
   token ke bina bhi test ho jaata hai.
   ============================================================ */

import {
  normalizeMetaCampaigns, normalizeMetaInsights,
  normalizeGoogleCampaigns, normalizeGoogleInsights,
} from "./sync-normalize";

const META_VERSION = process.env.META_API_VERSION || "v21.0";

/* ---------- config check ---------- */
export function metaConfig() {
  const token = process.env.META_SYSTEM_USER_TOKEN || "";
  const accounts = (process.env.META_AD_ACCOUNT_IDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return { token, accounts, ready: Boolean(token && accounts.length) };
}

export function googleConfig() {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || "";
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || "";
  const customers = (process.env.GOOGLE_ADS_CUSTOMER_IDS || "")
    .split(",").map((s) => s.trim().replace(/-/g, "")).filter(Boolean);
  const loginCustomer = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "");
  return {
    devToken, clientId, clientSecret, refreshToken, customers, loginCustomer,
    ready: Boolean(devToken && clientId && clientSecret && refreshToken && customers.length),
  };
}

export function syncStatus() {
  const m = metaConfig();
  const g = googleConfig();
  return {
    meta: {
      ready: m.ready,
      accounts: m.accounts.length,
      missing: m.ready ? [] : [
        !m.token ? "META_ACCESS_TOKEN" : null,
        !m.accounts.length ? "META_AD_ACCOUNT_IDS" : null,
      ].filter(Boolean),
      covers: ["Facebook", "Instagram"],
    },
    google: {
      ready: g.ready,
      accounts: g.customers.length,
      missing: g.ready ? [] : [
        !g.devToken ? "GOOGLE_ADS_DEVELOPER_TOKEN" : null,
        !g.clientId ? "GOOGLE_ADS_CLIENT_ID" : null,
        !g.clientSecret ? "GOOGLE_ADS_CLIENT_SECRET" : null,
        !g.refreshToken ? "GOOGLE_ADS_REFRESH_TOKEN" : null,
        !g.customers.length ? "GOOGLE_ADS_CUSTOMER_IDS" : null,
      ].filter(Boolean),
      covers: ["YouTube"],
    },
    website: { ready: true, covers: ["Website"], note: "Webhook always on — no token needed." },
  };
}

/* ---------- helpers ---------- */
async function getJson(url, init) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.[0]?.message || data?.raw || `HTTP ${res.status}`;
    throw new Error(String(msg).slice(0, 300));
  }
  return data;
}

/* Meta ek page me 25 rows deta hai — saare din chahiye to paging
   follow karni padti hai, warna mahine ka data adhoora aayega. */
async function metaPaged(url, cap = 20) {
  const out = [];
  let next = url;
  for (let i = 0; i < cap && next; i += 1) {
    const page = await getJson(next);
    if (Array.isArray(page.data)) out.push(...page.data);
    next = page.paging?.next || null;
  }
  return out;
}

/* ---------- META (Facebook + Instagram) ---------- */
export async function syncMeta({ since, until, accountName }) {
  const cfg = metaConfig();
  if (!cfg.ready) return { ok: false, notConfigured: true, missing: syncStatus().meta.missing };

  const campaigns = [];
  const daily = [];
  const errors = [];

  for (const acct of cfg.accounts) {
    const id = acct.startsWith("act_") ? acct : `act_${acct}`;
    try {
      const camps = await metaPaged(
        `https://graph.facebook.com/${META_VERSION}/${id}/campaigns` +
        `?fields=id,name,status,effective_status,objective,daily_budget,start_time,stop_time` +
        `&limit=100&access_token=${encodeURIComponent(cfg.token)}`);

      const nameById = {};
      camps.forEach((c) => { nameById[String(c.id)] = String(c.name || ""); });
      campaigns.push(...normalizeMetaCampaigns(camps, accountName || id));

      const insights = await metaPaged(
        `https://graph.facebook.com/${META_VERSION}/${id}/insights` +
        `?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks,actions` +
        `&breakdowns=publisher_platform` +
        `&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
        `&limit=200&access_token=${encodeURIComponent(cfg.token)}`);

      daily.push(...normalizeMetaInsights(insights, nameById));
    } catch (e) {
      errors.push(`${id}: ${e.message}`);
    }
  }

  return { ok: errors.length === 0, campaigns, daily, errors, accounts: cfg.accounts.length };
}

/* ---------- GOOGLE (YouTube) ---------- */
async function googleAccessToken(cfg) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token",
  });
  const data = await getJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return data.access_token;
}

export async function syncGoogle({ since, until, accountName }) {
  const cfg = googleConfig();
  if (!cfg.ready) return { ok: false, notConfigured: true, missing: syncStatus().google.missing };

  const campaigns = [];
  const daily = [];
  const errors = [];

  let access;
  try { access = await googleAccessToken(cfg); }
  catch (e) { return { ok: false, campaigns, daily, errors: [`OAuth: ${e.message}`] }; }

  const headers = {
    Authorization: `Bearer ${access}`,
    "developer-token": cfg.devToken,
    "Content-Type": "application/json",
    ...(cfg.loginCustomer ? { "login-customer-id": cfg.loginCustomer } : {}),
  };

  /* Sirf VIDEO campaigns — YouTube card ke liye wahi relevant hain. */
  const query = `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign_budget.amount_micros,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
           segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.advertising_channel_type = 'VIDEO'`;

  for (const cid of cfg.customers) {
    try {
      const data = await getJson(
        `https://googleads.googleapis.com/v18/customers/${cid}/googleAds:search`,
        { method: "POST", headers, body: JSON.stringify({ query, pageSize: 10000 }) });
      const rows = data.results || [];
      campaigns.push(...normalizeGoogleCampaigns(rows, accountName || cid));
      daily.push(...normalizeGoogleInsights(rows));
    } catch (e) {
      errors.push(`${cid}: ${e.message}`);
    }
  }

  /* Ek hi campaign har din ki row me aata hai — dedupe zaroori hai. */
  const seen = new Set();
  const uniqueCampaigns = campaigns.filter((c) => {
    const k = c.extId || c.name;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).map((c) => ({ ...c, channel: "YouTube" }));

  return { ok: errors.length === 0, campaigns: uniqueCampaigns, daily, errors, accounts: cfg.customers.length };
}
