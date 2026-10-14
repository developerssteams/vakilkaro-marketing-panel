/* ============================================================
   lib/google-ads-api.js  —  SERVER ONLY

   Google Ads API se YouTube campaigns aur daily spend.

   Meta se ek farq: yahan har baar refresh token se ek naya
   access token banana padta hai (wo 1 ghante me expire hota hai).
   ============================================================ */

import { googleConfig } from "./platform-config";

const GOOGLE_API_VERSION = "v18";

async function accessToken() {
  const c = googleConfig();
  if (!c.ready) throw new Error("Google Ads credentials are not set");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || "Google refresh token is not working — create it again.");
  }
  return json.access_token;
}

async function query(customerId, gaql) {
  const c = googleConfig();
  const token = await accessToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": c.devToken,
    "Content-Type": "application/json",
  };
  if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId;

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query: gaql }), cache: "no-store" },
  );
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = json?.[0]?.error?.message || json?.error?.message || `Google Ads error (${res.status})`;
    if (String(msg).includes("DEVELOPER_TOKEN")) throw new Error("Developer token is not approved yet or is invalid.");
    if (String(msg).includes("PERMISSION")) throw new Error("No access to this customer ID.");
    throw new Error(msg);
  }

  /* searchStream array of chunks deta hai — sabke results jodo. */
  const chunks = Array.isArray(json) ? json : [json];
  return chunks.flatMap((c2) => c2.results || []);
}

/* ---------- YouTube campaigns ---------- */
export async function fetchCampaigns(customerId) {
  const rows = await query(customerId, `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type,
           campaign_budget.amount_micros,
           campaign.start_date, campaign.end_date
    FROM campaign
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN')
      AND campaign.status != 'REMOVED'
  `);

  return rows.map((r) => ({
    extId: String(r.campaign?.id || ""),
    name: r.campaign?.name || "",
    status: mapStatus(r.campaign?.status),
    objective: "Awareness",
    dailyBudget: Number(r.campaignBudget?.amountMicros || 0) / 1000000,
    startDate: r.campaign?.startDate || "",
    endDate: r.campaign?.endDate || "",
  }));
}

/* ---------- daily spend + conversions ---------- */
export async function fetchDailyInsights(customerId, since, until) {
  const rows = await query(customerId, `
    SELECT campaign.id, campaign.name, segments.date,
           metrics.cost_micros, metrics.impressions,
           metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN')
  `);

  return rows.map((r) => ({
    date: r.segments?.date || "",
    extId: String(r.campaign?.id || ""),
    campaign: r.campaign?.name || "",
    channel: "YouTube",
    spend: Number(r.metrics?.costMicros || 0) / 1000000,
    impressions: Number(r.metrics?.impressions || 0),
    clicks: Number(r.metrics?.clicks || 0),
    /* YouTube par "lead" tabhi ginti hai jab conversion tracking laga ho.
       Nahi laga to ye 0 rahega — spend aur clicks phir bhi aayenge. */
    leads: Math.round(Number(r.metrics?.conversions || 0)),
    source: "Google Sync",
  }));
}

function mapStatus(s) {
  const v = String(s || "").toUpperCase();
  if (v === "ENABLED") return "Active";
  if (v === "PAUSED") return "Paused";
  if (v === "REMOVED") return "Completed";
  return "Draft";
}

export async function checkToken() {
  const c = googleConfig();
  const id = c.customerIds[0] || c.loginCustomerId;
  if (!id) throw new Error("GOOGLE_ADS_CUSTOMER_IDS is not set");
  await query(id, "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1");
  return { ok: true };
}
