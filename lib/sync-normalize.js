import { metaObjective } from "./objectives";
/* ============================================================
   lib/sync-normalize.js

   Meta / Google ka response → panel ki rows. Sirf pure functions,
   koi network call nahi — isliye inhe alag se test kiya ja sakta
   hai aur server + client dono jagah use ho sakte hain.

   Panel ke do dataset bharne hain:
     campaigns__live-ads      → ad ki pehchaan + status
     campaigns__daily-stats   → har din ka spend aur leads
   ============================================================ */

/* Meta ka insights breakdown "facebook" / "instagram" bhejta hai;
   panel ke cards Title Case me hain. */
const PLACEMENT_TO_CARD = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Facebook",
  messenger: "Facebook",
  threads: "Instagram",
};

/* Meta status → panel status */
const META_STATUS = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  CAMPAIGN_PAUSED: "Paused",
  ADSET_PAUSED: "Paused",
  ARCHIVED: "Completed",
  DELETED: "Completed",
  IN_PROCESS: "Draft",
  WITH_ISSUES: "Paused",
  PENDING_REVIEW: "Draft",
  DISAPPROVED: "Paused",
};

const GOOGLE_STATUS = {
  ENABLED: "Active",
  PAUSED: "Paused",
  REMOVED: "Completed",
  UNKNOWN: "Draft",
};

export function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }

/* Meta lead count actions array me chhupa hota hai, alag field me nahi. */
export function leadsFromActions(actions) {
  if (!Array.isArray(actions)) return 0;
  const hit = actions.find((a) =>
    ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"].includes(String(a.action_type)));
  return hit ? n(hit.value) : 0;
}

/* ---------- META ---------- */

export function normalizeMetaCampaigns(list, accountName) {
  return (list || []).map((c) => ({
    extId: String(c.id || ""),
    name: String(c.name || "Untitled"),
    account: accountName || "",
    level: "Campaign",
    objective: objectiveLabel(c.objective),
    objectiveRaw: c.objective || "",
    status: META_STATUS[String(c.effective_status || c.status || "").toUpperCase()] || "Draft",
    dailyBudget: c.daily_budget ? String(n(c.daily_budget) / 100) : "",
    startDate: (c.start_time || "").slice(0, 10),
    endDate: (c.stop_time || "").slice(0, 10),
    metaSync: "Synced",
    source: "Meta Sync",
  }));
}

function objectiveLabel(o) {
  return metaObjective(o) || "Leads";
}

/* Insights rows → daily-stats rows.
   Har row me date + campaign + placement hota hai, isliye ek hi
   campaign Facebook aur Instagram me alag-alag bat jaata hai —
   yahi cards ke split ka source hai. */
export function normalizeMetaInsights(rows, nameById = {}) {
  const out = [];
  for (const r of rows || []) {
    const date = String(r.date_start || "").slice(0, 10);
    if (!date) continue;
    const card = PLACEMENT_TO_CARD[String(r.publisher_platform || "").toLowerCase()] || "Facebook";
    out.push({
      date,
      campaign: nameById[String(r.campaign_id)] || String(r.campaign_name || ""),
      extId: String(r.campaign_id || ""),
      channel: card,
      spend: String(n(r.spend)),
      leads: String(leadsFromActions(r.actions)),
      impressions: String(n(r.impressions)),
      clicks: String(n(r.clicks)),
      source: "Meta Sync",
    });
  }
  return mergeDaily(out);
}

/* ---------- GOOGLE ---------- */

export function normalizeGoogleCampaigns(list, accountName) {
  return (list || []).map((row) => {
    const c = row.campaign || row;
    return {
      extId: String(c.id || ""),
      name: String(c.name || "Untitled"),
      account: accountName || "",
      level: "Campaign",
      objective: "Leads",
      status: GOOGLE_STATUS[String(c.status || "").toUpperCase()] || "Draft",
      dailyBudget: row.campaignBudget?.amountMicros ? String(n(row.campaignBudget.amountMicros) / 1e6) : "",
      metaSync: "Synced",
      source: "Google Sync",
    };
  });
}

/* Google micros me deta hai — 1 rupee = 1,000,000 micros. */
export function normalizeGoogleInsights(rows) {
  const out = [];
  for (const row of rows || []) {
    const date = String(row.segments?.date || "").slice(0, 10);
    if (!date) continue;
    const m = row.metrics || {};
    out.push({
      date,
      campaign: String(row.campaign?.name || ""),
      extId: String(row.campaign?.id || ""),
      channel: "YouTube",
      spend: String(n(m.costMicros) / 1e6),
      leads: String(Math.round(n(m.conversions))),
      impressions: String(n(m.impressions)),
      clicks: String(n(m.clicks)),
      source: "Google Sync",
    });
  }
  return mergeDaily(out);
}

/* Ek hi din + campaign + channel ki do rows aa jayein to jod do,
   warna table me duplicate dikhengi. */
export function mergeDaily(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.date}|${r.campaign}|${r.channel}`;
    const prev = map.get(key);
    if (!prev) { map.set(key, { ...r }); continue; }
    map.set(key, {
      ...prev,
      spend: String(n(prev.spend) + n(r.spend)),
      leads: String(n(prev.leads) + n(r.leads)),
      impressions: String(n(prev.impressions) + n(r.impressions)),
      clicks: String(n(prev.clicks) + n(r.clicks)),
    });
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------- MERGE INTO PANEL ----------
   Sync ka data manual entries ko chup-chaap na mita de, isliye:
   - campaign match extId se hota hai, warna naam se
   - manual daily entry par sync tabhi likhta hai jab user ne
     "overwrite manual" chuna ho
*/
export function mergeCampaigns(existing, incoming) {
  const rows = [...existing];
  let added = 0, updated = 0;

  for (const inc of incoming) {
    const i = rows.findIndex((r) =>
      (inc.extId && String(r.extId || "") === inc.extId) ||
      (String(r.name || "").toLowerCase() === String(inc.name || "").toLowerCase() &&
       String(r.channel || "") === String(inc.channel || "")));

    if (i === -1) {
      rows.unshift({
        id: `sync_${inc.extId || inc.name}_${Date.now()}_${added}`,
        channel: inc.channel || "Facebook",
        service: "",
        spend: "0", leads: "0", won: "0", impressions: "0", clicks: "0",
        ...inc,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      added += 1;
    } else {
      /* Service manual field hai — platform ko VakilKaro ki services
         nahi pata, isliye use kabhi overwrite nahi karte. */
      const keep = rows[i].service;
      rows[i] = { ...rows[i], ...inc, service: keep, updatedAt: new Date().toISOString() };
      updated += 1;
    }
  }
  return { rows, added, updated };
}

export function mergeDailyStats(existing, incoming, { overwriteManual = false } = {}) {
  const rows = [...existing];
  let added = 0, updated = 0, skipped = 0;

  for (const inc of incoming) {
    const i = rows.findIndex((r) =>
      String(r.date || "").slice(0, 10) === inc.date &&
      String(r.campaign || "") === String(inc.campaign || "") &&
      String(r.channel || "") === String(inc.channel || ""));

    if (i === -1) {
      rows.unshift({ id: `sync_${inc.date}_${inc.channel}_${added}_${Date.now()}`, ...inc, createdAt: new Date().toISOString() });
      added += 1;
      continue;
    }
    const isManual = String(rows[i].source || "Manual") === "Manual";
    if (isManual && !overwriteManual) { skipped += 1; continue; }
    rows[i] = { ...rows[i], ...inc, updatedAt: new Date().toISOString() };
    updated += 1;
  }
  return { rows, added, updated, skipped };
}

/* ---------- WEBSITE LEAD ---------- */
export function normalizeWebsiteLead(body) {
  const pick = (...keys) => {
    for (const k of keys) {
      const v = body?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  const phone = pick("phone", "phone_number", "mobile", "contact").replace(/\D/g, "").slice(-10);
  return {
    name: pick("name", "full_name", "fullName", "your-name") || "Website Lead",
    phone,
    email: pick("email", "email_address", "your-email"),
    city: pick("city", "location"),
    service: pick("service", "subject", "interested_in"),
    campaign: pick("campaign", "utm_campaign"),
    source: "Website",
    receivedAt: new Date().toISOString().slice(0, 10),
    flag: "Clean",
    stage: "New",
    status: "Received",
  };
}
