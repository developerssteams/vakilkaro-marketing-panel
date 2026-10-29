/* ============================================================
   lib/meta-api.js  —  SERVER ONLY

   Meta Marketing API se campaigns aur daily insights laata hai.

   Facebook aur Instagram ek hi token se aate hain — insights me
   `publisher_platform` breakdown maangte hain, jisse ek hi campaign
   ka kharcha dono cards me apne aap baant jaata hai.
   ============================================================ */

import { metaObjective } from "./objectives";
import { META_BASE, metaConfig } from "./platform-config";

/* ---------- Meta ki rate limit pe nazar ----------
   Har response ke header me Meta batata hai ki account ki API limit
   kitni bhar gayi (%). 1-minute auto-sync tabhi surakshit hai jab hum
   ye dekh ke khud dheeme ho jaayein — warna error 17 aata hai aur
   token kuch der block ho jaata hai. */
let usage = { pct: 0, regainMin: 0 };
export function resetUsage() { usage = { pct: 0, regainMin: 0 }; }
export function getUsage() { return { ...usage }; }
function trackUsage(res) {
  try {
    const acc = JSON.parse(res.headers.get("x-ad-account-usage") || "null");
    if (acc?.acc_id_util_pct !== undefined) usage.pct = Math.max(usage.pct, Number(acc.acc_id_util_pct) || 0);
    const buc = JSON.parse(res.headers.get("x-business-use-case-usage") || "null");
    if (buc) {
      Object.values(buc).flat().forEach((u) => {
        usage.pct = Math.max(usage.pct, Number(u.call_count) || 0, Number(u.total_cputime) || 0, Number(u.total_time) || 0);
        usage.regainMin = Math.max(usage.regainMin, Number(u.estimated_time_to_regain_access) || 0);
      });
    }
  } catch { /* header na ho to koi baat nahi */ }
}

async function graph(path, params = {}) {
  const { token } = metaConfig();
  if (!token && !params.access_token) throw new Error("META_TOKEN is not set in .env");

  const url = new URL(`${META_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  /* Page ki leads ke liye Page ka apna token chahiye — params me
     access_token aaye to wahi, warna system user token */
  if (!params.access_token) url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  trackUsage(res);
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json.error) {
    const e = json.error || {};
    if ([4, 17, 32, 613, 80000, 80004].includes(e.code)) usage.regainMin = Math.max(usage.regainMin, 10);
    /* Meta ke error codes seedha samajh me nahi aate — inhe Hinglish
       me badal dete hain taaki panel par kaam ki baat dikhe. */
    const known = {
      190: "Token has expired or is invalid — create a new System User token.",
      200: `Permission missing (${e.message || "#200"}).`,
      10: `Permission missing (${e.message || "#10"}).`,
      100: `Not found or no access (${e.message || "#100"}).`,
      4: "Meta rate limit hit — try again in a little while.",
      17: "Meta rate limit hit — try again in a little while.",
    };
    throw new Error(known[e.code] || e.message || `Meta API error (${res.status})`);
  }
  return json;
}

/* Saare pages jodke ek list — Meta 25-25 karke deta hai. */
async function graphAll(path, params = {}, cap = 200) {
  let out = [];
  let json = await graph(path, { limit: 100, ...params });
  out = out.concat(json.data || []);
  let next = json.paging?.next;
  let hops = 0;
  while (next && hops < cap) {
    const res = await fetch(next, { cache: "no-store" });
    trackUsage(res);
    const j = await res.json().catch(() => ({}));
    if (j.error) break;
    out = out.concat(j.data || []);
    next = j.paging?.next;
    hops += 1;
  }
  return out;
}

/* ---------- campaigns: naam, status, budget ---------- */
export async function fetchCampaigns(accountId) {
  /* issues_info = Meta ki taraf se delivery ki dikkat (policy, payment,
     audience). Kuch purane accounts pe ye field error deti hai — tab
     bina iske dobara maangte hain, taaki campaigns aana na ruke. */
  const base = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time";
  let rows;
  try {
    rows = await graphAll(`${accountId}/campaigns`, { fields: `${base},issues_info` });
  } catch {
    rows = await graphAll(`${accountId}/campaigns`, { fields: base });
  }
  return rows.map((c) => ({
    extId: c.id,
    name: c.name,
    /* effective_status asli haal batata hai — status "ACTIVE" ho par
       account band ho to bhi ad nahi chal raha hota. */
    status: mapStatus(c.effective_status || c.status),
    metaStatus: META_STATUS_LABEL[c.effective_status] || c.effective_status || "",
    objective: mapObjective(c.objective),
    objectiveRaw: c.objective || "",
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : 0,
    totalBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : 0,
    startDate: c.start_time ? c.start_time.slice(0, 10) : "",
    endDate: c.stop_time ? c.stop_time.slice(0, 10) : "",
    issue: (c.issues_info || []).map((i) => i.error_summary || i.error_message || "").filter(Boolean).join(" · "),
  }));
}

/* ---------- daily insights, Facebook vs Instagram alag ---------- */
export async function fetchDailyInsights(accountId, since, until) {
  const rows = await graphAll(`${accountId}/insights`, {
    level: "campaign",
    time_increment: 1,                    // har din ki alag row
    breakdowns: "publisher_platform",     // facebook / instagram alag
    time_range: { since, until },
    fields: "campaign_id,campaign_name,date_start,spend,impressions,reach,clicks,actions",
  });

  return rows.map((r) => {
    const formLeads = countFormLeads(r.actions);
    const chats = countChats(r.actions);
    return {
      date: r.date_start,
      extId: r.campaign_id,
      campaign: r.campaign_name,
      channel: mapPlatform(r.publisher_platform),
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      reach: Number(r.reach || 0),
      clicks: Number(r.clicks || 0),
      /* leads = form + WhatsApp chat. Dashboard, CPL, Analytics sab
         yahi padhte hain; breakdown alag field me rehta hai. */
      leads: formLeads + chats,
      formLeads,
      chats,
      source: "Meta Sync",
    };
  });
}

/* Leads ka hisaab.

   Meta ek hi lead ko kai action types me ginta hai — "lead" ek
   total hai jisme form lead aur pixel lead dono shamil hain. Sabko
   jod do to ek lead do-teen baar gin jaati hai (purane code me yahi
   ho raha tha). Isliye total wala "lead" pehle dekhte hain, wo na ho
   tabhi alag-alag type jodte hain.

   WhatsApp / Messenger chat alag ginte hain — click-to-WhatsApp ad
   me form nahi hota, wahan "lead" = chat shuru hui. */
function actionMap(actions) {
  const m = {};
  (Array.isArray(actions) ? actions : []).forEach((a) => { m[a.action_type] = Number(a.value || 0); });
  return m;
}

export function countFormLeads(actions) {
  const m = actionMap(actions);
  if (m.lead !== undefined) return m.lead;
  const parts = (m["onsite_conversion.lead_grouped"] || 0) + (m["offsite_conversion.fb_pixel_lead"] || 0);
  return parts || m.leadgen_grouped || 0;
}

export function countChats(actions) {
  const m = actionMap(actions);
  return m["onsite_conversion.messaging_conversation_started_7d"]
    ?? m["onsite_conversion.total_messaging_connection"]
    ?? 0;
}

function mapPlatform(p) {
  const v = String(p || "").toLowerCase();
  /* Threads ke ads Instagram ke through chalte hain */
  if (v === "instagram" || v === "threads") return "Instagram";
  if (v === "facebook") return "Facebook";
  if (v === "audience_network" || v === "messenger") return "Facebook";
  return "Facebook";
}

function mapStatus(s) {
  const v = String(s || "").toUpperCase();
  if (v === "ACTIVE") return "Active";
  if (v.includes("PAUSED")) return "Paused";
  if (v === "DELETED" || v === "ARCHIVED") return "Archived";
  if (v.includes("COMPLETED")) return "Completed";
  /* IN_PROCESS, PENDING_REVIEW, WITH_ISSUES, DISAPPROVED — chal nahi raha */
  if (v === "WITH_ISSUES" || v === "DISAPPROVED") return "Paused";
  return "Draft";
}

/* Meta ka asli status bhi rakhte hain — "In review" ya "Rejected"
   panel ke 5 status me nahi aata, par staff ko dikhna chahiye. */
export const META_STATUS_LABEL = {
  ACTIVE: "Active", PAUSED: "Paused", DELETED: "Deleted", ARCHIVED: "Archived",
  IN_PROCESS: "In review", PENDING_REVIEW: "In review", WITH_ISSUES: "With issues",
  CAMPAIGN_PAUSED: "Paused", ADSET_PAUSED: "Paused", DISAPPROVED: "Rejected",
};

function mapObjective(o) {
  return metaObjective(o) || "Leads";
}

/* ---------- token ka haal ---------- */
export async function checkToken() {
  const json = await graph("me", { fields: "id,name" });
  return { ok: true, name: json.name || json.id };
}

/* ============================================================
   ACCOUNT CONNECT — Ad Accounts → "Connect Meta Account"

   System User token ke paas jitne ad accounts assigned hain, sab
   yahan se list hote hain. User ko ID type nahi karni padti —
   galat ID ka sabse common reason yahi tha (act_ bhool jaana,
   ya Business Manager ki ID daal dena).
   ============================================================ */

/* Meta account_status number me deta hai */
const ACCOUNT_STATUS = {
  1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending Review",
  8: "Pending Settlement", 9: "Grace Period", 100: "Pending Closure", 101: "Closed",
};

/* Paisa Meta "minor unit" me deta hai — INR me paise, USD me cents.
   Jo currencies decimal nahi rakhti unke liye offset 1 hai. */
const NO_DECIMAL = ["JPY", "KRW", "VND", "IDR", "CLP", "COP", "HUF", "ISK", "PYG", "TWD"];
function fromMinor(v, currency) {
  const n = Number(v || 0);
  return NO_DECIMAL.includes(String(currency).toUpperCase()) ? n : n / 100;
}

/* Account level ki dikkat — Ads Manager me "Payment error" isi se
   aata hai. Campaign ACTIVE dikhta hai par account ki wajah se ad
   delivery band hoti hai, isliye ise alag se pakadna padta hai. */
const DISABLE_REASON = {
  1: "Ads integrity policy", 2: "Ads IP review", 3: "Payment risk", 4: "Gray account shut down",
  5: "AFC review", 6: "Business integrity", 7: "Permanent close", 8: "Unused reseller account",
};
function accountProblem(a) {
  const st = a.account_status;
  if (st === 1) return "";
  if (st === 3) return "Payment error — bill not cleared, ads are not running";
  if (st === 8) return "Payment pending settlement";
  if (st === 9) return "Grace period — pay soon, otherwise ads will stop";
  if (st === 2) return `Account disabled${DISABLE_REASON[a.disable_reason] ? ` (${DISABLE_REASON[a.disable_reason]})` : ""}`;
  if (st === 7) return "Account is under review";
  if (st === 100 || st === 101) return "Account has been closed";
  return `Account status ${st}`;
}

function shapeAccount(a) {
  const currency = a.currency || "INR";
  return {
    problem: accountProblem(a),
    accountId: a.id,                                   // act_123...
    name: a.name || a.id,
    status: ACCOUNT_STATUS[a.account_status] || `Status ${a.account_status}`,
    active: a.account_status === 1,
    currency,
    timezone: a.timezone_name || "",
    bmId: a.business?.id || "",
    bmName: a.business?.name || "",
    amountSpent: fromMinor(a.amount_spent, currency),
    balance: fromMinor(a.balance, currency),
    spendCap: fromMinor(a.spend_cap, currency),
    disableReason: a.disable_reason || 0,
  };
}

const ACCOUNT_FIELDS = "id,name,account_status,currency,timezone_name,business{id,name},amount_spent,balance,spend_cap,disable_reason";

export async function listAdAccounts() {
  const rows = await graphAll("me/adaccounts", { fields: ACCOUNT_FIELDS });
  return rows.map(shapeAccount);
}

export async function fetchAccountDetails(accountId) {
  const id = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
  const a = await graph(id, { fields: ACCOUNT_FIELDS });
  return shapeAccount(a);
}

/* Pehla Facebook Page jo is account se ad chala sakta hai —
   Page ID form me apne aap bhar jaata hai. Na mile to khaali. */
export async function fetchPromotePage(accountId) {
  try {
    const j = await graph(`${accountId}/promote_pages`, { fields: "id,name", limit: 1 });
    const p = (j.data || [])[0];
    return p ? { pageId: p.id, pageName: p.name } : { pageId: "", pageName: "" };
  } catch {
    return { pageId: "", pageName: "" };
  }
}

/* Token ki asli haalat — kab expire hoga, kaunsi permissions hain.
   Iske liye App ID + App Secret chahiye (app access token). Na ho
   to sirf naam check hota hai, expiry "unknown" rehti hai. */
/* ads_read ke bina kuch nahi aata. ads_management sirf ON/OFF aur
   Create Ad ke liye — iske bina data phir bhi aata hai. */
export const REQUIRED_SCOPES = ["ads_read"];
export const NICE_SCOPES = ["ads_management", "business_management", "leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_ads"];

/* Token ki granted permissions — App Secret ki zaroorat nahi.
   Na pata chale to null (andaaza nahi lagate). */
export async function tokenScopes(tok) {
  try {
    const j = await graph("me/permissions", { limit: 100, ...(tok ? { access_token: tok } : {}) });
    return (j.data || []).filter((p) => p.status === "granted").map((p) => p.permission);
  } catch { return null; }
}

export async function tokenInfo() {
  const { token, appId, appSecret } = metaConfig();
  /* Ye call fail hua matlab token hi kharab hai — baaki sab baad me */
  const me = await graph("me", { fields: "id,name" });
  const out = { ok: true, name: me.name || me.id, expiresAt: null, neverExpires: null, scopes: [], missing: [], missingNice: [], note: "" };

  if (!appId || !appSecret) {
    /* App secret ke bina bhi permissions /me/permissions se mil jaati hain */
    const granted = await tokenScopes(token);
    if (granted) {
      out.scopes = granted;
      out.missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));
      out.missingNice = NICE_SCOPES.filter((s) => !granted.includes(s));
    }
    return { ...out, note: "META_APP_ID / META_APP_SECRET missing — the token works, but expiry could not be checked." };
  }

  /* debug_token ke liye App ID + Secret chahiye. Ye galat ho (jaise
     App ID ki jagah ad account ID pada ho) to token kharab NAHI hai —
     sirf expiry ka pata nahi chalega. Isliye yahan fail hone par
     poora connect nahi rokte, bas note dikhate hain. */
  try {
    const url = new URL(`${META_BASE}/debug_token`);
    url.searchParams.set("input_token", token);
    url.searchParams.set("access_token", `${appId}|${appSecret}`);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (j.error || !j.data) {
      return { ...out, note: `Expiry check failed — META_APP_ID / META_APP_SECRET look wrong (${j.error?.message || "no data"}). Use the App ID shown at the top of the developer dashboard.` };
    }
    const d = j.data;
    if (d.is_valid === false) return { ...out, ok: false, error: d.error?.message || "Token is not valid" };
    if (d.app_id && String(d.app_id) !== String(appId)) {
      out.note = `This token belongs to App ${d.app_id}, but META_APP_ID in .env is ${appId} — make them the same.`;
    }
    out.scopes = d.scopes || [];
    out.missing = REQUIRED_SCOPES.filter((s) => !out.scopes.includes(s));
    out.missingNice = NICE_SCOPES.filter((s) => !out.scopes.includes(s));
    out.neverExpires = !d.expires_at;
    out.expiresAt = d.expires_at ? new Date(d.expires_at * 1000).toISOString().slice(0, 10) : null;
    return out;
  } catch {
    return { ...out, note: "Expiry could not be checked — the token still works." };
  }
}

/* Token jo accounts dekh sakta hai + .env me likhe accounts.
   me/adaccounts kabhi khaali aata hai (token me business_management
   na ho, ya account partner-share hua ho) — tab .env wale accounts
   seedha ID se uthate hain. Dono list mila ke duplicate hata dete hain. */
export async function listAllAccounts() {
  const { accountIds } = metaConfig();
  const seen = new Map();
  const errors = [];

  try {
    (await listAdAccounts()).forEach((a) => seen.set(a.accountId, { ...a, source: "token" }));
  } catch (e) {
    errors.push({ account: "me/adaccounts", message: e?.message || "list fail" });
  }

  for (const id of accountIds) {
    if (seen.has(id)) { seen.get(id).inEnv = true; continue; }
    try {
      const a = await fetchAccountDetails(id);
      seen.set(a.accountId, { ...a, source: "env", inEnv: true });
    } catch (e) {
      errors.push({ account: id, message: e?.message || "no access" });
    }
  }
  return { accounts: [...seen.values()], errors };
}


/* ============================================================
   ADS MANAGER JAISA DATA

   Ads Manager ka "Results" har campaign me alag cheez hota hai —
   ad set ka goal (optimization_goal) tay karta hai:
     Lead form campaign   → Leads (Form)
     Messaging campaign   → Messaging conversations started
     Website lead         → Website leads (pixel)
     Call campaign        → Calls
   Isliye data AD SET level pe laate hain, har ad set ka result uske
   goal se nikaalte hain, phir campaign me jodte hain. Yahi Ads
   Manager karta hai — tabhi Results aur Cost per result match hote hain.

   Do tareeke, is order me:
     1. Meta ka apna `results` field (bilkul Ads Manager wala number)
     2. Na mile to goal → action type ki table (neeche RESULT_MAP)

   Attribution: June 2025 se Meta API khud Ads Manager wali
   attribution setting lagata hai, alag se kuch nahi bhejna padta.
   ============================================================ */

const LEAD_FORM = ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"];
const CHAT = ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"];

/* goal → [Ads Manager ka label, kaunse action type me result hai (pehla jo mile)] */
const RESULT_MAP = {
  LEAD_GENERATION:        ["Leads (Form)", LEAD_FORM],
  QUALITY_LEAD:           ["Leads (Form)", LEAD_FORM],
  CONVERSATIONS:          ["Messaging conversations started", CHAT],
  REPLIES:                ["Messaging conversations started", CHAT],
  QUALITY_CALL:           ["Calls placed", ["click_to_call_native_call_placed", "click_to_call_call_confirm", "click_to_call_native_20s_call_connect"]],
  LINK_CLICKS:            ["Link clicks", ["link_click"]],
  LANDING_PAGE_VIEWS:     ["Landing page views", ["landing_page_view", "omni_landing_page_view"]],
  POST_ENGAGEMENT:        ["Post engagements", ["post_engagement"]],
  PAGE_LIKES:             ["Page likes", ["like"]],
  PROFILE_VISIT:          ["Profile visits", ["ig_profile_visit", "instagram_profile_visit"]],
  REACH:                  ["Reach", "reach"],
  IMPRESSIONS:            ["Impressions", "impressions"],
};

function actionValue(m, keys) {
  for (const k of keys) if (m[k] !== undefined) return m[k];
  return 0;
}

/* Website conversion — kaunsa pixel event optimize ho raha hai */
function pixelResult(m, event) {
  const ev = String(event || "LEAD").toLowerCase();
  const label = { lead: "Website leads", complete_registration: "Registrations completed", purchase: "Purchases",
    contact: "Contacts", submit_application: "Applications submitted", schedule: "Schedules" }[ev] || `Website ${ev}`;
  return [label, actionValue(m, [`offsite_conversion.fb_pixel_${ev}`, `onsite_web_${ev}`, ev === "lead" ? "lead" : `omni_${ev}`])];
}

/* Meta ka `results` field: [{ indicator: "actions:onsite_conversion.lead_grouped", values: [{ value: "17" }] }] */
const INDICATOR_LABEL = {
  "onsite_conversion.lead_grouped": "Leads (Form)", lead: "Leads",
  "onsite_conversion.messaging_conversation_started_7d": "Messaging conversations started",
  "offsite_conversion.fb_pixel_lead": "Website leads", link_click: "Link clicks",
  landing_page_view: "Landing page views", reach: "Reach", post_engagement: "Post engagements",
};
function parseMetaResults(results) {
  if (!Array.isArray(results) || !results.length) return null;
  let total = 0; const labels = new Set();
  for (const r of results) {
    const v = Number(r?.values?.[0]?.value ?? r?.value ?? 0);
    if (!Number.isFinite(v)) continue;
    total += v;
    const ind = String(r?.indicator || "").replace(/^actions:/, "");
    labels.add(INDICATOR_LABEL[ind] || ind || "Results");
  }
  return { value: total, label: labels.size === 1 ? [...labels][0] : "Multiple conversions" };
}

function resultFor(row, adset) {
  const fromMeta = parseMetaResults(row.results);
  if (fromMeta) return fromMeta;

  const m = actionMap(row.actions);
  const goal = String(row.optimization_goal || adset?.goal || "").toUpperCase();
  if (goal === "OFFSITE_CONVERSIONS" || goal === "VALUE") {
    const [label, value] = pixelResult(m, adset?.event);
    return { label, value };
  }
  const map = RESULT_MAP[goal];
  if (map) {
    const [label, src] = map;
    const value = typeof src === "string" ? Number(row[src] || 0) : actionValue(m, src);
    return { label, value };
  }
  /* Goal pata nahi — form lead maan lo (VakilKaro ke zyaadatar campaign yahi hain) */
  return { label: "Leads", value: actionValue(m, LEAD_FORM) };
}

/* Ad sets: goal, pixel event, budget. Budget agar campaign pe nahi
   hai (Ads Manager me "Using ad set budget") to yahin se aata hai. */
async function fetchAdSets(accountId) {
  const fields = "id,campaign_id,optimization_goal,promoted_object,destination_type,daily_budget,lifetime_budget,effective_status";
  let rows = [];
  try {
    rows = await graphAll(`${accountId}/adsets`, {
      fields, limit: 500,
      effective_status: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED", "ARCHIVED"],
    });
  } catch {
    try { rows = await graphAll(`${accountId}/adsets`, { fields, limit: 500 }); } catch { rows = []; }
  }
  const map = {};
  rows.forEach((a) => {
    map[a.id] = {
      campaignId: a.campaign_id,
      goal: a.optimization_goal || "",
      event: a.promoted_object?.custom_event_type || "",
      daily: a.daily_budget ? Number(a.daily_budget) / 100 : 0,
      lifetime: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : 0,
      running: !/DELETED|ARCHIVED/.test(String(a.effective_status || "")),
      active: String(a.effective_status || "") === "ACTIVE",
    };
  });
  return map;
}

/* Lambi date range ek baar me maango to Meta "data zyada hai" bolke
   mana kar deta hai — 30-30 din ke tukde */
function chunkRange(since, until, days = 30) {
  const out = [];
  let a = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (a <= end) {
    const b = new Date(a); b.setUTCDate(b.getUTCDate() + days - 1);
    const to = b < end ? b : end;
    out.push([a.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]);
    a = new Date(to); a.setUTCDate(a.getUTCDate() + 1);
  }
  return out;
}

async function adsetInsights(accountId, since, until) {
  const base = "campaign_id,campaign_name,adset_id,date_start,spend,impressions,clicks,inline_link_clicks,actions";
  const params = (fields, s, u) => ({
    level: "adset", time_increment: 1, breakdowns: "publisher_platform",
    time_range: { since: s, until: u }, fields, limit: 500,
  });
  const rows = [];
  for (const [s, u] of chunkRange(since, until)) {
    /* results + optimization_goal naye fields hain — kisi account pe error
       de to bina unke dobara, goal ad set list se le lenge */
    let part;
    try { part = await graphAll(`${accountId}/insights`, params(`${base},optimization_goal,results`, s, u)); }
    catch {
      try { part = await graphAll(`${accountId}/insights`, params(`${base},optimization_goal`, s, u)); }
      catch { part = await graphAll(`${accountId}/insights`, params(base, s, u)); }
    }
    rows.push(...part);
  }
  return rows;
}

/* Ek account ka sab kuch: campaigns (budget ke saath) + din-wise data */
export async function fetchAccountData(accountId, since, until) {
  const [campaigns, adsets, rows] = await Promise.all([
    fetchCampaigns(accountId),
    fetchAdSets(accountId),
    adsetInsights(accountId, since, until),
  ]);

  /* Campaign pe budget nahi → chal rahe ad sets ka jod */
  campaigns.forEach((c) => {
    const mine = Object.values(adsets).filter((a) => a.campaignId === c.extId && a.running);
    const goals = [...new Set(mine.map((a) => a.goal).filter(Boolean))];
    c.goal = goals.length === 1 ? goals[0] : goals.length ? "MULTIPLE" : "";
    c.resultLabel = goals.length === 1 ? (RESULT_MAP[goals[0]]?.[0] || (goals[0] === "OFFSITE_CONVERSIONS" ? "Website leads" : "Results")) : goals.length ? "Multiple conversions" : "";

    if (c.dailyBudget || c.totalBudget) { c.budgetSource = "Campaign"; return; }
    const live = mine.filter((a) => a.active);
    const pick = live.length ? live : mine;
    c.dailyBudget = pick.reduce((t, a) => t + a.daily, 0);
    c.totalBudget = pick.reduce((t, a) => t + a.lifetime, 0);
    c.budgetSource = mine.length ? "Ad set" : "";
  });

  /* Ad set rows → campaign + din + platform ka ek row */
  const agg = new Map();
  rows.forEach((r) => {
    const channel = mapPlatform(r.publisher_platform);
    const key = `${r.date_start}|${r.campaign_id}|${channel}`;
    if (!agg.has(key)) {
      agg.set(key, {
        date: r.date_start, extId: r.campaign_id, campaign: r.campaign_name, channel,
        spend: 0, impressions: 0, clicks: 0, linkClicks: 0, results: 0, formLeads: 0, chats: 0,
        labels: new Set(), source: "Meta Sync",
      });
    }
    const t = agg.get(key);
    const m = actionMap(r.actions);
    const res = resultFor(r, adsets[r.adset_id]);
    t.spend += Number(r.spend || 0);
    t.impressions += Number(r.impressions || 0);
    t.clicks += Number(r.clicks || 0);
    t.linkClicks += Number(r.inline_link_clicks || 0);
    t.results += res.value;
    if (res.value > 0 || Number(r.spend || 0) > 0) t.labels.add(res.label);
    t.formLeads += actionValue(m, LEAD_FORM);
    t.chats += actionValue(m, CHAT);
  });

  const daily = [...agg.values()].map((t) => {
    const labels = [...t.labels];
    return {
      ...t, labels: undefined,
      spend: Math.round(t.spend * 100) / 100,
      resultLabel: labels.length === 1 ? labels[0] : labels.length ? "Multiple conversions" : "",
      /* leads = Ads Manager ka Results. Dashboard, Analytics, CPL sab yahi padhte hain */
      leads: t.results,
    };
  });

  return { campaigns, daily };
}

/* ============================================================
   EK CAMPAIGN KE ADS — Campaigns → Active campaign → "Ads"

   Campaign kholne pe hi Meta se aata hai (store nahi hota). Ad
   level ka data bahut bada hota hai — har minute sync karein to
   Meta ki limit bhar jaaye aur campaign wala live sync ruk jaaye.

   Results har ad ke ad set ke goal se — wahi resultFor() jo
   campaign level pe lagta hai, taaki ads ka jod = campaign total.
   ============================================================ */

const AD_STATUS = {
  ACTIVE: "Live", PAUSED: "Paused", ADSET_PAUSED: "Ad set off", CAMPAIGN_PAUSED: "Campaign off",
  PENDING_REVIEW: "In review", IN_PROCESS: "In review", PREAPPROVED: "In review",
  DISAPPROVED: "Rejected", WITH_ISSUES: "Issue", ARCHIVED: "Archived", PENDING_BILLING_INFO: "Billing pending",
};

export async function fetchCampaignAds(campaignId, since, until) {
  const adFields = "id,name,effective_status,created_time,adset_id,adset{name,optimization_goal,promoted_object},creative{thumbnail_url,image_url,object_type,title,body},issues_info";
  const statuses = ["ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED", "DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO", "ARCHIVED"];

  /* ads ki list — kuch purane accounts pe kuch field error deti hai,
     tab halki list maangte hain */
  let ads;
  try { ads = await graphAll(`${campaignId}/ads`, { fields: adFields, effective_status: statuses, limit: 200 }); }
  catch { ads = await graphAll(`${campaignId}/ads`, { fields: "id,name,effective_status,adset_id,creative{thumbnail_url}", limit: 200 }); }

  const adsetMap = {};
  ads.forEach((a) => {
    if (a.adset_id && !adsetMap[a.adset_id]) {
      adsetMap[a.adset_id] = { goal: a.adset?.optimization_goal || "", event: a.adset?.promoted_object?.custom_event_type || "", name: a.adset?.name || "" };
    }
  });

  /* insights — ad level, FB/IG alag, poori range ka total (din-wise nahi) */
  const base = "ad_id,ad_name,adset_id,spend,impressions,clicks,inline_link_clicks,actions";
  const params = (fields, s, u) => ({ level: "ad", breakdowns: "publisher_platform", time_range: { since: s, until: u }, fields, limit: 500 });
  const rows = [];
  for (const [s, u] of chunkRange(since, until, 90)) {
    let part;
    try { part = await graphAll(`${campaignId}/insights`, params(`${base},optimization_goal,results`, s, u)); }
    catch {
      try { part = await graphAll(`${campaignId}/insights`, params(`${base},optimization_goal`, s, u)); }
      catch { part = await graphAll(`${campaignId}/insights`, params(base, s, u)); }
    }
    rows.push(...part);
  }

  const blank = () => ({ spend: 0, impressions: 0, clicks: 0, linkClicks: 0, results: 0, formLeads: 0, chats: 0, labels: new Set() });
  const stats = {};
  rows.forEach((r) => {
    const id = r.ad_id;
    if (!stats[id]) stats[id] = { all: blank(), Facebook: blank(), Instagram: blank(), name: r.ad_name, adsetId: r.adset_id };
    const ch = mapPlatform(r.publisher_platform);
    const m = actionMap(r.actions);
    const res = resultFor(r, adsetMap[r.adset_id]);
    [stats[id].all, stats[id][ch] || stats[id].Facebook].forEach((t) => {
      t.spend += Number(r.spend || 0);
      t.impressions += Number(r.impressions || 0);
      t.clicks += Number(r.clicks || 0);
      t.linkClicks += Number(r.inline_link_clicks || 0);
      t.results += res.value;
      t.formLeads += actionValue(m, LEAD_FORM);
      t.chats += actionValue(m, CHAT);
      if (res.value > 0 || Number(r.spend || 0) > 0) t.labels.add(res.label);
    });
  });

  const done = (t) => {
    const labels = [...t.labels];
    return {
      spend: Math.round(t.spend * 100) / 100, impressions: t.impressions, clicks: t.clicks, linkClicks: t.linkClicks,
      results: t.results, formLeads: t.formLeads, chats: t.chats,
      resultLabel: labels.length === 1 ? labels[0] : labels.length ? "Multiple conversions" : "",
    };
  };

  /* list wale ads + jo list me nahi par range me kharch hua (delete ho gaye) */
  const out = ads.map((a) => {
    const st = stats[a.id];
    return {
      id: a.id, name: a.name,
      status: AD_STATUS[a.effective_status] || a.effective_status || "",
      rawStatus: a.effective_status || "",
      adset: a.adset?.name || adsetMap[a.adset_id]?.name || "", adsetId: a.adset_id || "",
      thumb: a.creative?.thumbnail_url || a.creative?.image_url || "",
      kind: a.creative?.object_type || "",
      headline: a.creative?.title || "", text: a.creative?.body || "",
      created: a.created_time ? a.created_time.slice(0, 10) : "",
      issue: (a.issues_info || []).map((i) => i.error_summary || i.error_message || "").filter(Boolean).join(" · "),
      all: done(st?.all || blank()), fb: done(st?.Facebook || blank()), ig: done(st?.Instagram || blank()),
    };
  });
  Object.entries(stats).forEach(([id, st]) => {
    if (out.some((a) => a.id === id)) return;
    out.push({
      id, name: st.name || id, status: "Deleted", rawStatus: "DELETED", adset: adsetMap[st.adsetId]?.name || "", adsetId: st.adsetId || "",
      thumb: "", kind: "", headline: "", text: "", created: "", issue: "",
      all: done(st.all), fb: done(st.Facebook), ig: done(st.Instagram),
    });
  });
  return out;
}

/* ============================================================
   LEADS — har ad se, saare pages

   Pehle leads sirf un lead forms se aati thi jinki ID panel me
   saved ho (yaani jo ad panel ke Create Ad se bana). Ads Manager
   se bane ads ki leads kabhi nahi aati thi. Ab account ke har lead
   ad se seedha /{ad-id}/leads — form ID jaanna zaroori nahi.
   Purana code sirf pehli 100 leads laata tha; ye saare pages laata hai.
   ============================================================ */
const LEAD_GOALS = ["LEAD_GENERATION", "QUALITY_LEAD"];

function parseLead(l) {
  const f = {};
  (l.field_data || []).forEach((x) => { f[String(x.name || "").toLowerCase()] = (x.values || [])[0] || ""; });
  const pick = (...keys) => { for (const k of keys) if (f[k]) return f[k]; return ""; };
  const anyKey = (re) => { const k = Object.keys(f).find((x) => re.test(x)); return k ? f[k] : ""; };
  const name = pick("full_name", "name") || [pick("first_name"), pick("last_name")].filter(Boolean).join(" ");
  return {
    extId: l.id,
    createdAt: l.created_time,
    name,
    phone: String(pick("phone_number", "phone", "mobile_number", "mobile") || anyKey(/phone|mobile|whatsapp/)).replace(/\D/g, "").slice(-10),
    email: pick("email", "work_email") || anyKey(/email/),
    city: pick("city") || anyKey(/city|location|district/),
    state: pick("state", "province") || anyKey(/^state|state$|province|rajya/),
    service: pick("service") || anyKey(/service|which|need|requirement/),
    campaignExtId: l.campaign_id || "",
    campaignName: l.campaign_name || "",
    adId: l.ad_id || "", adName: l.ad_name || "",
    formId: l.form_id || "",
    organic: Boolean(l.is_organic),
    channel: String(l.platform || "").toLowerCase() === "ig" ? "Instagram" : "Facebook",
  };
}

const LEAD_FIELDS = "id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id,platform,is_organic";

/* Ad kis Page se chal raha hai — "pageId_postId" ka pehla hissa */
function adPageId(ad) {
  const c = ad.creative || {};
  const spec = c.object_story_spec?.page_id;
  if (spec) return String(spec);
  const story = String(c.effective_object_story_id || "");
  return story.includes("_") ? story.split("_")[0] : "";
}

/* pageTokens: { pageId: token } — ad ke token se leads na milein to
   us ad ke Page ke token se dobara maangte hain. */
export async function fetchAccountLeads(accountId, sinceIso, pageTokens = {}) {
  const { leadsToken } = metaConfig();
  const tok = { access_token: leadsToken };
  const fields = "id,name,campaign_id,adset{optimization_goal},creative{effective_object_story_id,object_story_spec{page_id}}";
  let ads = [];
  try {
    ads = await graphAll(`${accountId}/ads`, {
      ...tok, fields,
      effective_status: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ARCHIVED", "WITH_ISSUES", "IN_PROCESS", "PENDING_REVIEW", "DISAPPROVED"],
      limit: 200,
    });
  } catch {
    try { ads = await graphAll(`${accountId}/ads`, { ...tok, fields, limit: 200 }); }
    catch (e) {
      /* Asli Meta error upar bhejo — "0 lead ads checked" ka kaaran yahi hai */
      const err = new Error(`Could not list ads of ${accountId}: ${e?.message || "failed"}`);
      err.stage = "ads"; throw err;
    }
  }
  /* Sirf lead form wale ads (messaging ads ki "leads" nahi hoti) */
  const leadAds = ads.filter((a) => !a.adset?.optimization_goal || LEAD_GOALS.includes(a.adset.optimization_goal));
  const filt = sinceIso ? { filtering: [{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(new Date(sinceIso).getTime() / 1000) }] } : {};

  const leads = []; const errors = []; const pageIds = new Set();
  for (const ad of leadAds) {
    const pid = adPageId(ad);
    if (pid) pageIds.add(pid);
    try {
      (await graphAll(`${ad.id}/leads`, { ...tok, fields: LEAD_FIELDS, limit: 500, ...filt })).forEach((l) => leads.push(parseLead(l)));
    } catch (e) {
      const ptok = pid && pageTokens[pid];
      if (ptok) {
        try {
          (await graphAll(`${ad.id}/leads`, { access_token: ptok, fields: LEAD_FIELDS, limit: 500, ...filt })).forEach((l) => leads.push(parseLead(l)));
          continue;
        } catch (e2) { errors.push({ ad: ad.name || ad.id, message: e2?.message || "failed" }); continue; }
      }
      errors.push({ ad: ad.name || ad.id, message: e?.message || "failed" });
    }
  }
  return { leads, errors, adsChecked: leadAds.length, adsTotal: ads.length, pageIds: [...pageIds] };
}

/* ============================================================
   PAYMENTS — Meta billing history

   Do raaste:
     1. /act_x/transactions  — asli billing charges (amount, time,
        status, payment method). Kai accounts pe isme finance
        permission chahiye ("Manage ad accounts" / full access).
     2. Na mile to /act_x/activities me billing events.
   Dono na mile to saaf error — panel jhootha data nahi banata.
   ============================================================ */
function minorToMajor(v, currency) { return fromMinor(v, currency); }

/* Payment ka asli waqt — date IST me (raat 12–5:30 wala payment galat din pe na jaaye) */
function istDate(d) { return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function stamp(t) {
  if (t == null || t === "") return null;
  const d = typeof t === "number" || /^\d+$/.test(String(t)) ? new Date(Number(t) * 1000) : new Date(String(t).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}


export async function fetchAccountPayments(accountId, sinceIso) {
  const since = sinceIso ? Math.floor(new Date(sinceIso).getTime() / 1000) : 0;
  /* Account prepaid hai ya card wala — "Paid" ka payment method isi se */
  let acc = {};
  try { acc = await graph(accountId, { fields: "currency,is_prepay_account,funding_source_details" }); } catch { /* */ }
  const currency = acc.currency || "INR";
  const fsText = `${acc.funding_source_details?.display_string || ""}`;
  const prepay = acc.is_prepay_account === true || /balance|prepa/i.test(fsText);
  /* Card wale account me Meta "Visa ··1234" jaisa dikhata hai */
  const cardText = !prepay && fsText ? fsText : "";

  /* Meta /transactions (Transaction ID, VAT) normal apps ko nahi deta —
     isliye Ads Manager → Billing & payments ki entries activity log se:
       funding_event_successful  → paisa balance me daala  → Funded
       ad_account_billing_charge → balance / card se kata → Paid
       ad_account_billing_decline → payment fail           → Failed
       ad_account_billing_refund / chargeback               → Refunded */
  const acts = await graphAll(`${accountId}/activities`, {
    fields: "event_type,event_time,extra_data,translated_event_type",
    ...(since ? { since } : {}),
    limit: 200,
  });
  const KIND = {
    funding_event_successful: "Funded",
    ad_account_billing_charge: "Paid",
    ad_account_billing_chargeback_reversal: "Paid",
    ad_account_billing_decline: "Failed",
    ad_account_billing_refund: "Refunded",
    ad_account_billing_chargeback: "Refunded",
  };
  /* Meta ka likha hua naam bhi dekhte hain — kuch accounts me event_type
     alag hota hai par "Money added to balance" likha hota hai */
  const kindOf = (a) => {
    const t = String(a.translated_event_type || "").toLowerCase();
    if (/added to (your )?balance|funds? added|money added|add(ed)? funds/.test(t)) return "Funded";
    return KIND[String(a.event_type || "")] || "";
  };
  const payments = acts.filter((a) => kindOf(a)).map((a) => {
    const ev = String(a.event_type);
    const label = kindOf(a);
    let x = {}; try { x = typeof a.extra_data === "string" ? JSON.parse(a.extra_data) : (a.extra_data || {}); } catch { /* */ }
    const raw = x.amount ?? x.new_value ?? x.charge_amount ?? x.value;
    /* activity log paise (minor unit) me deta hai */
    const amount = Math.abs(raw != null ? minorToMajor(raw, x.currency || currency) : 0);
    const when = stamp(a.event_time);
    /* extra_data me jo bhi payment method likha ho */
    const hint = [x.payment_method, x.payment_method_type, x.funding_source, x.payment_option, x.credential_type, x.payment_type]
      .filter(Boolean).map(String).join(" ") || JSON.stringify(x).replace(/"(amount|currency|new_value|old_value)":[^,}]*/g, "");
    /* Prepaid account me fail = paisa daalne ki koshish fail hui */
    const isFund = label === "Funded" || (label === "Failed" && prepay);
    const method = isFund ? fundMethod(hint)
      : prepay ? "Prepaid balance"
      : cardMethod(hint, cardText);
    return {
      extId: `act-${ev}-${a.event_time}-${Math.round(amount * 100)}`,
      txId: "",
      date: when ? istDate(when) : String(a.event_time || "").slice(0, 10),
      time: when ? when.toISOString() : "",
      amount,
      type: label === "Refunded" ? "Refund" : isFund ? "Credit" : prepay ? "Spend" : "Credit",
      status: label === "Failed" ? "Cancelled" : "Posted",
      metaStatus: label,
      method,
      vatInvoiceId: "",
      payMode: method,
      reason: a.translated_event_type || ev,
    };
  }).filter((p) => p.amount > 0);
  return { payments, source: "activities", currency, prepay };
}

/* Paisa daalne ka tareeka — Meta jaisa naam */
function fundMethod(h) {
  const o = String(h || "").toLowerCase();
  if (/upi/.test(o)) return "UPI";
  if (/net.?bank|netbank/.test(o)) return "Net banking";
  if (/card|visa|master|amex|rupay/.test(o)) return "Card";
  if (/neft|imps|rtgs|bank/.test(o)) return "Bank transfer";
  if (/paytm|wallet|paypal/.test(o)) return "Wallet";
  return "Manual payment";
}
function cardMethod(h, display) {
  const o = `${h || ""} ${display || ""}`.toLowerCase();
  if (display && /\d{4}/.test(display)) return display.trim();
  if (/upi/.test(o)) return "UPI autopay";
  if (/card|visa|master|amex|rupay/.test(o)) return "Card";
  if (/net.?bank/.test(o)) return "Net banking";
  return "Automatic payment";
}


/* ============================================================
   LEADS — doosra raasta: Page ke token se, Page ke lead forms se

   Meta me leads Page ki hoti hain. Ad se maangne pe kai baar Meta
   bina error ke khaali list deta hai (jab Leads Access me system user
   ko ijaazat na ho). Page token + form se maangna zyada pakka hai,
   aur har form ka leads_count batata hai ki leads hain bhi ya nahi.
   ============================================================ */
/* Saare Page tokens jo mil sakein — teen jagah se:
     1. me/accounts (system user ko Page assign ho)
     2. .env ka META_PAGE_TOKENS (Page token ya user token)
     3. lead ads ke Page ID → {page}?fields=access_token
   Map: pageId → { id, name, token, via } */
export async function collectPageTokens(extraPageIds = [], base = null) {
  const { leadsToken, pageTokens } = metaConfig();
  const pages = new Map(); const errors = [...(base?.errors || [])];
  (base?.pages || []).forEach((p) => pages.set(p.id, p));
  const put = (id, name, token, via) => {
    if (!id) return;
    const prev = pages.get(String(id));
    if (prev?.token) return;
    pages.set(String(id), { id: String(id), name: name || prev?.name || String(id), token: token || "", via });
  };

  if (!base) try { (await graphAll("me/accounts", { fields: "id,name,access_token", limit: 100, access_token: leadsToken })).forEach((p) => put(p.id, p.name, p.access_token, "assigned")); }
  catch (e) { errors.push({ where: "pages", message: e?.message || "pages failed" }); }

  for (const pt of base ? [] : pageTokens) {
    try {
      if (pt.pageId) {
        const me = await graph(pt.pageId, { fields: "id,name", access_token: pt.token }).catch(() => ({ id: pt.pageId }));
        put(pt.pageId, me.name, pt.token, "env"); continue;
      }
      /* User token ho to uske saare pages; Page token ho to "me" hi Page hai */
      let list = null;
      try { list = await graphAll("me/accounts", { fields: "id,name,access_token", limit: 100, access_token: pt.token }); } catch { list = null; }
      if (list) list.forEach((p) => put(p.id, p.name, p.access_token, "env"));
      else { const me = await graph("me", { fields: "id,name", access_token: pt.token }); put(me.id, me.name, pt.token, "env"); }
    } catch (e) { errors.push({ where: "META_PAGE_TOKENS", message: e?.message || "page token failed" }); }
  }

  for (const pid of extraPageIds) {
    if (pages.get(String(pid))?.token) continue;
    try { const p = await graph(String(pid), { fields: "id,name,access_token", access_token: leadsToken }); put(p.id, p.name, p.access_token, "ad"); }
    catch { put(pid, "", "", "ad"); }
  }
  return { pages: [...pages.values()], errors };
}

/* Page token + lead forms — leads Page ki hoti hain, ad ki nahi
   (ad ke rasta me Page ki ijaazat na ho to bhi ye chal jaata hai).
   Har form ka leads_count batata hai ki leads hain bhi ya nahi. */
export async function fetchPageLeads(sinceIso, collected) {
  const out = { leads: [], forms: [], pages: [], errors: [] };
  const got = collected || await collectPageTokens();
  out.errors.push(...got.errors);

  const since = sinceIso ? Math.floor(new Date(sinceIso).getTime() / 1000) : 0;
  for (const pg of got.pages) {
    out.pages.push({ id: pg.id, name: pg.name, hasToken: Boolean(pg.token), via: pg.via });
    if (!pg.token) continue;
    let forms = [];
    try { forms = await graphAll(`${pg.id}/leadgen_forms`, { fields: "id,name,status,leads_count", limit: 100, access_token: pg.token }); }
    catch (e) { out.errors.push({ where: pg.name, message: e?.message || "forms failed" }); continue; }
    for (const f of forms) {
      out.forms.push({ id: f.id, name: f.name, page: pg.name, status: f.status, leadsCount: Number(f.leads_count) || 0 });
      if (!Number(f.leads_count)) continue;
      const params = { fields: LEAD_FIELDS, limit: 500, access_token: pg.token };
      if (since) params.filtering = [{ field: "time_created", operator: "GREATER_THAN", value: since }];
      try { (await graphAll(`${f.id}/leads`, params)).forEach((l) => out.leads.push({ ...parseLead(l), formId: l.form_id || f.id, formName: f.name, page: pg.name })); }
      catch (e) { out.errors.push({ where: `${pg.name} / ${f.name}`, message: e?.message || "leads failed" }); }
    }
  }
  return out;
}

/* ============================================================
   AD PREVIEW — Campaigns → Ads → "Preview"

   Meta ka apna preview (/{ad}/previews) — wahi jo Ads Manager me
   dikhta hai: video play hota hai, carousel swipe hota hai. Har
   placement (FB feed, IG feed, Reels, Story) alag maang sakte hain.
   Saath me video ki asli file (source) — mil jaaye to panel ke
   apne player me bhi chalti hai.
   ============================================================ */
export const PREVIEW_FORMATS = {
  MOBILE_FEED_STANDARD: "Facebook Feed",
  INSTAGRAM_STANDARD: "Instagram Feed",
  INSTAGRAM_REELS: "Instagram Reels",
  INSTAGRAM_STORY: "Instagram Story",
  FACEBOOK_REELS_MOBILE: "Facebook Reels",
  FACEBOOK_STORY_MOBILE: "Facebook Story",
  DESKTOP_FEED_STANDARD: "Facebook Desktop",
};

function iframeFrom(body) {
  const html = String(body || "");
  const src = (html.match(/src="([^"]+)"/) || [])[1] || "";
  const w = Number((html.match(/width="(\d+)"/) || [])[1]) || 0;
  const h = Number((html.match(/height="(\d+)"/) || [])[1]) || 0;
  return src ? { src: src.replace(/&amp;/g, "&"), width: w, height: h } : null;
}

export async function fetchAdPreview(adId, format = "MOBILE_FEED_STANDARD") {
  const { leadsToken } = metaConfig();
  const fields = "id,name,account_id,effective_status,creative{id,object_type,thumbnail_url,image_url,video_id,title,body,call_to_action_type,effective_object_story_id,instagram_permalink_url,object_story_spec,asset_feed_spec}";
  let ad;
  try { ad = await graph(adId, { fields }); }
  catch { ad = await graph(adId, { fields: "id,name,account_id,creative{id,object_type,thumbnail_url,title,body,effective_object_story_id}" }); }
  const c = ad.creative || {};
  const spec = c.object_story_spec || {};
  const feed = c.asset_feed_spec || {};

  /* 1 · Meta ka preview iframe */
  let preview = null; let previewError = "";
  try {
    const j = await graph(`${adId}/previews`, { ad_format: format });
    preview = iframeFrom((j.data || [])[0]?.body);
    if (!preview) previewError = "Meta did not return a preview for this placement.";
  } catch (e) { previewError = e?.message || "Preview failed"; }

  /* 2 · video ki asli file — pehle apne token se, phir Page token se */
  const videoId = c.video_id || spec.video_data?.video_id || (feed.videos || [])[0]?.video_id || "";
  let video = null;
  if (videoId) {
    const vf = { fields: "source,picture,length,permalink_url" };
    try { video = await graph(videoId, { ...vf, access_token: leadsToken }); }
    catch {
      const pageId = spec.page_id || String(c.effective_object_story_id || "").split("_")[0] || "";
      try {
        const col = await collectPageTokens(pageId ? [pageId] : []);
        const tok = col.pages.find((p) => p.id === pageId && p.token)?.token || col.pages.find((p) => p.token)?.token;
        if (tok) video = await graph(videoId, { ...vf, access_token: tok });
      } catch { video = null; }
    }
  }

  /* 3 · copy + links */
  const link = spec.link_data || {};
  const vdata = spec.video_data || {};
  const story = String(c.effective_object_story_id || "");
  const [pg, post] = story.includes("_") ? story.split("_") : ["", ""];
  return {
    id: ad.id, name: ad.name, status: ad.effective_status || "",
    kind: c.object_type || (videoId ? "VIDEO" : ""),
    format, formats: PREVIEW_FORMATS,
    preview, previewError,
    video: video?.source ? { src: video.source, poster: video.picture || c.thumbnail_url || "", seconds: Math.round(Number(video.length) || 0) } : null,
    videoId,
    image: c.image_url || link.picture || c.thumbnail_url || "",
    headline: c.title || link.name || vdata.title || (feed.titles || [])[0]?.text || "",
    text: c.body || link.message || vdata.message || (feed.bodies || [])[0]?.text || "",
    cta: String(c.call_to_action_type || link.call_to_action?.type || vdata.call_to_action?.type || "").replace(/_/g, " ").toLowerCase(),
    links: {
      facebook: pg && post ? `https://www.facebook.com/${pg}/posts/${post}` : "",
      instagram: c.instagram_permalink_url || "",
      adsManager: ad.account_id ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ad.account_id}&selected_ad_ids=${ad.id}` : "",
    },
  };
}


/* Prepaid account ka bacha hua balance — Ads Manager ke "Prepaid balance"
   jaisa. Meta ye funding_source_details.display_string me deta hai
   (jaise "Available balance: ₹13,778.23"). Na mile to null. */
export async function fetchPrepaidBalance(accountId) {
  try {
    const j = await graph(accountId, { fields: "currency,funding_source_details" });
    const f = j.funding_source_details || {};
    const txt = String(f.display_string || "");
    const m = txt.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)/);
    const prepaid = /balance|prepa|fund/i.test(txt) && m ? Number(m[1]) : null;
    return { prepaid, display: txt, type: f.type ?? null, currency: j.currency || "INR" };
  } catch { return { prepaid: null, display: "", type: null, currency: "INR" }; }
}

/* ============================================================
   LEAD FORMS — Campaigns → "Lead Forms"

   Jo ads abhi chal rahe hain (ACTIVE), unke creative me lead form ki
   ID hoti hai (call_to_action.value.lead_gen_form_id). Har form ke
   sawaal (questions) Meta se laate hain — kaunsa column, kis type ka,
   kya options. Form Page ka hota hai, isliye pehle system user token,
   na chale to us Page ka token.
   ============================================================ */
function formIdsOf(creative) {
  const ids = new Set();
  const take = (cta) => { const v = cta?.value?.lead_gen_form_id; if (v) ids.add(String(v)); };
  const s = creative?.object_story_spec || {};
  take(s.link_data?.call_to_action); take(s.video_data?.call_to_action); take(s.template_data?.call_to_action);
  (s.link_data?.child_attachments || []).forEach((c) => take(c.call_to_action));
  (creative?.asset_feed_spec?.call_to_actions || []).forEach((c) => take(c));
  return [...ids];
}

const FORM_FIELDS = "id,name,status,locale,leads_count,created_time,questions,privacy_policy_url,follow_up_action_url,thank_you_page,context_card,page";

export async function fetchRunningLeadForms(accountIds) {
  const { leadsToken } = metaConfig();
  const out = { campaigns: [], forms: {}, errors: [] };
  const camps = new Map(); const pageIds = new Set(); const formPage = {};
  const adFields = "id,name,effective_status,campaign{id,name,effective_status,objective},adset{name,optimization_goal,destination_type},creative{call_to_action_type,effective_object_story_id,object_story_spec,asset_feed_spec}";

  for (const acc of accountIds) {
    let ads = [];
    try { ads = await graphAll(`${acc}/ads`, { fields: adFields, effective_status: ["ACTIVE"], limit: 100, access_token: leadsToken }); }
    catch (e) {
      try { ads = await graphAll(`${acc}/ads`, { fields: adFields, effective_status: ["ACTIVE"], limit: 100 }); }
      catch (e2) { out.errors.push({ where: acc, message: e2?.message || e?.message || "ads failed" }); continue; }
    }
    for (const ad of ads) {
      const c = ad.campaign || {};
      const key = String(c.id || ad.id);
      if (!camps.has(key)) camps.set(key, { id: c.id || "", name: c.name || ad.name, status: c.effective_status || "", objective: c.objective || "", account: acc, ads: [] });
      const ids = formIdsOf(ad.creative);
      const pid = adPageId(ad);
      if (pid) pageIds.add(pid);
      ids.forEach((f) => { if (pid) formPage[f] = pid; });
      camps.get(key).ads.push({
        id: ad.id, name: ad.name, adset: ad.adset?.name || "", goal: ad.adset?.optimization_goal || "",
        destination: ad.adset?.destination_type || "", cta: ad.creative?.call_to_action_type || "", formIds: ids,
      });
    }
  }

  /* Form details — pehle main token, phir Page token */
  const allForms = [...new Set([...camps.values()].flatMap((c) => c.ads.flatMap((a) => a.formIds)))];
  Object.assign(out.forms, await readLeadForms(allForms, [...pageIds], formPage));
  out.campaigns = [...camps.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

/* Form IDs → form details (sawaal, thank-you page…). Pehle main token,
   na chale to us Page ka token. */
async function readLeadForms(allForms, pageIds, formPage) {
  const { leadsToken } = metaConfig();
  const forms = {};
  let col = null;
  for (const fid of allForms) {
    let f = null; let lastErr = "";
    try { f = await graph(fid, { fields: FORM_FIELDS, access_token: leadsToken }); }
    catch (e) {
      lastErr = e?.message || "";
      if (!col) col = await collectPageTokens(pageIds).catch(() => ({ pages: [] }));
      const pid = formPage[fid];
      const tries = col.pages.filter((p) => p.token && (!pid || p.id === pid)).concat(col.pages.filter((p) => p.token && pid && p.id !== pid));
      for (const p of tries) {
        try { f = await graph(fid, { fields: FORM_FIELDS, access_token: p.token }); break; }
        catch (e2) { lastErr = e2?.message || lastErr; }
      }
    }
    if (!f) { forms[fid] = { id: fid, error: lastErr || "Could not read this form" }; continue; }
    forms[fid] = {
      id: f.id, name: f.name || "", status: f.status || "", locale: f.locale || "",
      leadsCount: Number(f.leads_count) || 0, created: f.created_time || "",
      page: f.page?.name || "", pageId: f.page?.id || formPage[fid] || "",
      privacy: f.privacy_policy_url || "", followUp: f.follow_up_action_url || "",
      intro: f.context_card ? { title: f.context_card.title || "", style: f.context_card.style || "", content: f.context_card.content || [] } : null,
      thankYou: f.thank_you_page ? { title: f.thank_you_page.title || "", body: f.thank_you_page.body || "", button: f.thank_you_page.button_text || "", url: f.thank_you_page.website_url || "", type: f.thank_you_page.button_type || "" } : null,
      questions: (f.questions || []).map((q) => ({
        key: q.key || "", label: q.label || "", type: q.type || "", id: q.id || "",
        options: (q.options || []).map((o) => o.value || o.key || "").filter(Boolean),
        conditional: Boolean(q.conditional_questions_group_id || q.dependent_conditional_questions),
      })),
    };
  }
  return forms;
}

/* Ek campaign ke saare ads (kisi bhi status ke) + unke lead forms —
   Campaigns → Ads drawer → "View form details" */
export async function fetchCampaignLeadForms(campaignId) {
  const { leadsToken } = metaConfig();
  const fields = "id,name,effective_status,adset{optimization_goal,destination_type},creative{call_to_action_type,effective_object_story_id,object_story_spec,asset_feed_spec}";
  let ads = [];
  try { ads = await graphAll(`${campaignId}/ads`, { fields, limit: 100, access_token: leadsToken }); }
  catch { ads = await graphAll(`${campaignId}/ads`, { fields, limit: 100 }); }
  const pageIds = new Set(); const formPage = {};
  const list = ads.map((ad) => {
    const ids = formIdsOf(ad.creative); const pid = adPageId(ad);
    if (pid) pageIds.add(pid);
    ids.forEach((f) => { if (pid) formPage[f] = pid; });
    return { id: ad.id, name: ad.name, formIds: ids, destination: ad.adset?.destination_type || "", cta: ad.creative?.call_to_action_type || "" };
  });
  const forms = await readLeadForms([...new Set(list.flatMap((a) => a.formIds))], [...pageIds], formPage);
  return { ads: list, forms };
}


/* ============================================================
   STATE-WISE — Campaigns → "States"

   Meta insights ko region (state) ke hisaab se todta hai — kis state
   me kitna kharch hua aur kitni leads / chats aayi. Ye Meta ka apna
   andaaza hai ki dekhne wala kahan tha (form me likha state nahi).
   ============================================================ */
/* level "adset" (States tab) → har ad set ki row bhi (adsetId, adsetName,
   adsetActive). Default "campaign" — Leads by state popup wahi padhta hai. */
export async function fetchRegionInsights(accountIds, since, until, level = "campaign") {
  const out = { rows: [], errors: [], level };
  const bySet = level === "adset";
  const fields = `campaign_id,campaign_name,${bySet ? "adset_id,adset_name," : ""}spend,impressions,inline_link_clicks,actions`;
  for (const acc of accountIds) {
    try {
      const [rows, sets] = await Promise.all([
        graphAll(`${acc}/insights`, {
          level: bySet ? "adset" : "campaign", breakdowns: "region", time_range: { since, until }, fields, limit: 500,
        }),
        bySet ? fetchAdSets(acc) : Promise.resolve({}),
      ]);
      rows.forEach((r) => {
        const m = actionMap(r.actions);
        const leads = countFormLeads(r.actions);
        const chats = m["onsite_conversion.messaging_conversation_started_7d"] || 0;
        out.rows.push({
          account: acc, campaignId: String(r.campaign_id || ""), campaign: r.campaign_name || "",
          ...(bySet ? { adsetId: String(r.adset_id || ""), adset: r.adset_name || "", adsetActive: Boolean(sets[r.adset_id]?.active) } : {}),
          region: String(r.region || "Unknown").replace(/^Unknown$/i, "Unknown"),
          spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.inline_link_clicks) || 0,
          leads, chats,
        });
      });
    } catch (e) { out.errors.push({ account: acc, message: e?.message || "region insights failed" }); }
  }
  return out;
}

/* ============================================================
   adNames(["1202…", …]) → { [adId]: { adName, campaignName, accountId } }
   WhatsApp leads (app/api/meta/chat-leads) ke ad ID se ad + campaign
   ka naam. 50-50 ke batch me; koi ek ID galat ho to batch fail hota
   hai, tab us batch ki IDs ek-ek karke try karte hain.
   ============================================================ */
const AD_NAME_FIELDS = "name,account_id,campaign{name}";
function shapeAdName(a) {
  return { adName: a?.name || "", campaignName: a?.campaign?.name || "", accountId: a?.account_id ? String(a.account_id) : "" };
}
export async function adNames(ids = []) {
  const list = [...new Set((ids || []).map((x) => String(x || "").trim()).filter((x) => /^\d{5,25}$/.test(x)))];
  const out = {};
  for (let i = 0; i < list.length; i += 50) {
    const part = list.slice(i, i + 50);
    try {
      const json = await graph("", { ids: part.join(","), fields: AD_NAME_FIELDS });
      Object.entries(json || {}).forEach(([id, a]) => { if (a && typeof a === "object") out[id] = shapeAdName(a); });
    } catch {
      for (const id of part) {
        try { out[id] = shapeAdName(await graph(id, { fields: AD_NAME_FIELDS })); } catch { /* ye ad nahi mila — chhod do */ }
      }
    }
  }
  return out;
}

/* ============================================================
   TIME FILTER — fetchHourlyWindow(accountIds, fromMs, toMs)

   Campaigns ke filter me date ke saath time (jaise kal 06:00 → aaj
   abhi). Meta ka data ghante-ghante ka milta hai (ad account ke time
   zone me), isliye jo ghanta window ko chhoota hai wo poora ginte hain.

   Meta ghante wale data ko Facebook / Instagram me nahi baant-ta
   (hourly + publisher_platform saath nahi chalta). Isliye har din ka
   Facebook : Instagram hissa us din ke platform data se lete hain aur
   usi hisaab se ghante ka total baant-te hain. Campaign us din ek hi
   platform pe chala ho to bilkul sahi; dono pe chala ho to andaaza
   (estimated: true).

   Lautata hai daily-stats jaisi rows (date + campaign + channel), taaki
   cards, tables aur FB vs IG view bina badle chal jaayein.
   ============================================================ */
function tzParts(ms, tz) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return p;
}
function tzDate(ms, tz) { const p = tzParts(ms, tz); return `${p.year}-${p.month}-${p.day}`; }
/* Account ke time zone ka "YYYY-MM-DD HH:00" → asli waqt (ms) */
function zonedHourToMs(date, hour, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const off = (ms) => { const p = tzParts(ms, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms; };
  let t = guess - off(guess);
  t = guess - off(t);
  return t;
}

const METRIC_KEYS = ["spend", "impressions", "clicks", "linkClicks", "results", "formLeads", "chats"];
function rowMetrics(r, adset) {
  const m = actionMap(r.actions);
  const res = resultFor(r, adset);
  return {
    spend: Number(r.spend || 0), impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
    linkClicks: Number(r.inline_link_clicks || 0), results: res.value,
    formLeads: actionValue(m, LEAD_FORM), chats: actionValue(m, CHAT),
    label: res.value > 0 || Number(r.spend || 0) > 0 ? res.label : "",
  };
}
function addInto(t, x) { METRIC_KEYS.forEach((k) => { t[k] = (t[k] || 0) + (x[k] || 0); }); if (x.label) t.labels.add(x.label); }

/* Poore number ko hisson me baanto, jod wahi rahe (largest remainder) */
function splitInt(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = Math.round(total - out.reduce((a, b) => a + b, 0));
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i] += 1; left -= 1; } });
  return out;
}

async function hourlyInsights(accountId, since, until) {
  const base = "campaign_id,campaign_name,adset_id,date_start,spend,impressions,clicks,inline_link_clicks,actions";
  const params = (fields) => ({
    level: "adset", time_increment: 1, breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
    time_range: { since, until }, fields, limit: 500,
  });
  try { return await graphAll(`${accountId}/insights`, params(`${base},optimization_goal,results`), 400); }
  catch {
    try { return await graphAll(`${accountId}/insights`, params(`${base},optimization_goal`), 400); }
    catch { return graphAll(`${accountId}/insights`, params(base), 400); }
  }
}

export async function fetchHourlyWindow(accountIds, fromMs, toMs) {
  const out = { rows: [], errors: [], estimated: false, timezones: {} };
  for (const acc of accountIds) {
    try {
      let tz = "Asia/Kolkata";
      try { const a = await graph(acc, { fields: "timezone_name" }); if (a.timezone_name) tz = a.timezone_name; } catch { /* IST maan lo */ }
      out.timezones[acc] = tz;
      const since = tzDate(fromMs, tz);
      const until = tzDate(Math.min(toMs, Date.now()), tz);

      const [adsets, hourly, platformDaily] = await Promise.all([
        fetchAdSets(acc),
        hourlyInsights(acc, since, until),
        adsetInsights(acc, since, until),
      ]);

      /* 1. Window ke andar wale ghante → din + campaign ka total */
      const H = new Map();
      hourly.forEach((r) => {
        const hr = parseInt(String(r.hourly_stats_aggregated_by_advertiser_time_zone || "").slice(0, 2), 10);
        if (!Number.isFinite(hr)) return;
        const start = zonedHourToMs(r.date_start, hr, tz);
        if (!(start < toMs && start + 3600000 > fromMs)) return;
        const key = `${r.date_start}|${r.campaign_id}`;
        if (!H.has(key)) H.set(key, { date: r.date_start, extId: String(r.campaign_id), campaign: r.campaign_name || "", labels: new Set() });
        addInto(H.get(key), rowMetrics(r, adsets[r.adset_id]));
      });

      /* 2. Usi din ka Facebook / Instagram hissa */
      const P = new Map();
      platformDaily.forEach((r) => {
        const key = `${r.date_start}|${r.campaign_id}`;
        if (!H.has(key)) return;
        const ch = mapPlatform(r.publisher_platform);
        if (!P.has(key)) P.set(key, {});
        const g = P.get(key);
        if (!g[ch]) g[ch] = { labels: new Set() };
        addInto(g[ch], rowMetrics(r, adsets[r.adset_id]));
      });

      /* 3. Ghante ka total platform me baanto */
      H.forEach((t, key) => {
        const g = P.get(key) || {};
        let chans = Object.keys(g).filter((c) => METRIC_KEYS.some((k) => g[c][k] > 0));
        if (!chans.length) chans = Object.keys(g).length ? Object.keys(g) : ["Facebook"];
        if (chans.length > 1) out.estimated = true;
        const labels = [...t.labels];
        const parts = chans.map(() => ({}));
        METRIC_KEYS.forEach((k) => {
          let w = chans.map((c) => g[c]?.[k] || 0);
          if (!w.some(Boolean)) w = chans.map((c) => g[c]?.spend || 0);
          if (!w.some(Boolean)) w = chans.map((c) => g[c]?.impressions || 0);
          if (!w.some(Boolean)) w = chans.map((_, i) => (i === 0 ? 1 : 0));
          if (k === "spend") {
            const sum = w.reduce((a, b) => a + b, 0);
            const cents = splitInt(Math.round((t.spend || 0) * 100), w.map((x) => x / sum));
            cents.forEach((c, i) => { parts[i].spend = c / 100; });
          } else {
            splitInt(Math.round(t[k] || 0), w).forEach((v, i) => { parts[i][k] = v; });
          }
        });
        chans.forEach((ch, i) => {
          const x = parts[i];
          if (!METRIC_KEYS.some((k) => x[k] > 0)) return;
          out.rows.push({
            date: t.date, extId: t.extId, campaign: t.campaign, channel: ch, account: acc,
            spend: x.spend || 0, impressions: x.impressions || 0, clicks: x.clicks || 0, linkClicks: x.linkClicks || 0,
            results: x.results || 0, leads: x.results || 0, formLeads: x.formLeads || 0, chats: x.chats || 0,
            resultLabel: labels.length === 1 ? labels[0] : labels.length ? "Multiple conversions" : "",
            source: "Meta Hourly", estimated: chans.length > 1,
          });
        });
      });
    } catch (e) { out.errors.push({ account: acc, message: e?.message || "hourly data failed" }); }
  }
  return out;
}

/* ============================================================
   BY TIME — din ke kis ghante kitni leads (Campaigns → "By Time")

   fetchHourOfDay(accountIds, since, until) → har campaign ke 24 ghante.
   Poori range ka jod (Meta khud saare din jod deta hai), ghanta ad
   account ke time zone me (IST).
   ============================================================ */
export async function fetchHourOfDay(accountIds, since, until) {
  const out = { rows: [], errors: [] };
  const fields = "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions";
  for (const acc of accountIds) {
    try {
      const rows = await graphAll(`${acc}/insights`, {
        level: "campaign", breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        time_range: { since, until }, fields, limit: 500,
      }, 400);
      rows.forEach((r) => {
        const hour = parseInt(String(r.hourly_stats_aggregated_by_advertiser_time_zone || "").slice(0, 2), 10);
        if (!Number.isFinite(hour)) return;
        const m = actionMap(r.actions);
        out.rows.push({
          account: acc, campaignId: String(r.campaign_id || ""), campaign: r.campaign_name || "", hour,
          spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.inline_link_clicks) || 0,
          leads: countFormLeads(r.actions),
          chats: m["onsite_conversion.messaging_conversation_started_7d"] || 0,
        });
      });
    } catch (e) { out.errors.push({ account: acc, message: e?.message || "hour-wise data failed" }); }
  }
  return out;
}