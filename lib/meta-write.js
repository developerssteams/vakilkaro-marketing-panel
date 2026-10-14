/* ============================================================
   lib/meta-write.js  —  SERVER ONLY

   Meta par actual campaign banata / badalta hai.

   Meta ka structure teen level ka hai aur teeno alag calls hain:
     Campaign  → objective, budget cap
     Ad Set    → audience, placement, schedule, budget
     Ad        → creative + lead form ka link

   Panel ke ek form se teeno banate hain. Beech me koi step fail
   ho to upar wale bane hue objects ko paused chhod dete hain,
   taaki adhoora ad kabhi live na chale.
   ============================================================ */

import { META_BASE, metaConfig } from "./platform-config";

async function post(path, body) {
  const { token } = metaConfig();
  if (!token) throw new Error("META_TOKEN is not set in .env");

  const form = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  form.set("access_token", token);

  const res = await fetch(`${META_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw metaError(json.error, res.status);
  return json;
}

async function get(path, params = {}) {
  const { token } = metaConfig();
  if (!token) throw new Error("META_TOKEN is not set in .env");
  const url = new URL(`${META_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw metaError(json.error, res.status);
  return json;
}

/* Meta ke error codes seedha samajh me nahi aate — Hinglish me badalte hain. */
function metaError(e = {}, status = 500) {
  const map = {
    190: "Token has expired or is invalid — create a new System User token.",
    200: "Token does not have ads_management permission.",
    100: "A field is invalid or there is no access to the account.",
    2635: "This is an old API version — the panel needs an update.",
    1487742: "Ad account balance is exhausted — recharge from Ads Manager.",
    1359188: "Daily budget is too low — Meta's minimum is ₹80/day.",
    4: "Meta rate limit hit — try again in a little while.",
  };
  const msg = map[e.code] || e.error_user_msg || e.message || `Meta API error (${status})`;
  const err = new Error(msg);
  err.code = e.code;
  return err;
}

/* ---------- objective mapping ---------- */
const OBJECTIVE = {
  Leads: "OUTCOME_LEADS",
  Sales: "OUTCOME_SALES",
  Traffic: "OUTCOME_TRAFFIC",
  Messages: "OUTCOME_ENGAGEMENT",
  Awareness: "OUTCOME_AWARENESS",
};

/* Placement — Automatic pe Meta khud FB aur IG dono chalata hai,
   isiliye panel me dono cards apne aap bharte hain. */
function placementFor(mode) {
  if (mode === "Automatic" || !mode) return {};
  const map = {
    "Facebook Feed": { publisher_platforms: ["facebook"], facebook_positions: ["feed"] },
    "Instagram Feed": { publisher_platforms: ["instagram"], instagram_positions: ["stream"] },
    "Stories": { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["story"], instagram_positions: ["story"] },
    "Reels": { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["facebook_reels"], instagram_positions: ["reels"] },
  };
  return map[mode] || {};
}

/* ---------- 1 · Lead form ---------- */
export async function createLeadForm(pageId, { name, service, services = [], privacyUrl }) {
  const questions = [
    { type: "FULL_NAME" },
    { type: "PHONE" },
    { type: "EMAIL" },
    { type: "CITY" },
  ];

  /* Service dropdown — iske bina staff ko call karke poochna padta hai
     ki kya chahiye, aur service-wise CPL bhi nahi nikalta. */
  if (services.length) {
    questions.push({
      type: "CUSTOM",
      key: "service",
      label: "Which service do you need?",
      options: services.slice(0, 12).map((s) => ({ key: s.toLowerCase().replace(/[^a-z0-9]+/g, "_"), value: s })),
    });
  }

  const json = await post(`${pageId}/leadgen_forms`, {
    name: `${name} · ${service || "VakilKaro"}`.slice(0, 80),
    questions,
    privacy_policy: { url: privacyUrl || "https://vakilkaro.in/privacy-policy", link_text: "Privacy Policy" },
    follow_up_action_url: privacyUrl || "https://vakilkaro.in",
    locale: "en_US",
  });
  return json.id;
}

/* ---------- 2 · Campaign ---------- */
export async function createCampaign(accountId, d) {
  const json = await post(`${accountId}/campaigns`, {
    name: d.name,
    objective: OBJECTIVE[d.objective] || "OUTCOME_LEADS",
    /* Hamesha PAUSED banao — Ad Set aur Ad banne ke baad hi chalu
       karte hain, warna adhoora campaign paisa kha sakta hai. */
    status: "PAUSED",
    special_ad_categories: [],
    ...(d.cplCap ? { bid_strategy: "COST_CAP" } : {}),
  });
  return json.id;
}

/* ---------- 3 · Ad Set ---------- */
export async function createAdSet(accountId, campaignId, d) {
  const targeting = {
    geo_locations: buildGeo(d),
    age_min: Number(d.ageMin || 18),
    age_max: Number(d.ageMax || 65),
    ...(d.gender && d.gender !== "All" ? { genders: [d.gender === "Male" ? 1 : 2] } : {}),
    ...placementFor(d.placement),
  };

  const body = {
    name: `${d.name} · Ad Set`,
    campaign_id: campaignId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: d.destination === "Lead Form" ? "LEAD_GENERATION" : "LINK_CLICKS",
    targeting,
    /* Meta paise me leta hai — ₹500 → 50000 */
    ...(d.budgetType === "Lifetime"
      ? { lifetime_budget: Math.round(Number(d.budget) * 100) }
      : { daily_budget: Math.round(Number(d.budget) * 100) }),
    ...(d.startDate ? { start_time: `${d.startDate}T00:00:00+0530` } : {}),
    ...(d.endDate ? { end_time: `${d.endDate}T23:59:00+0530` } : {}),
    ...(d.cplCap ? { bid_amount: Math.round(Number(d.cplCap) * 100) } : {}),
  };

  if (d.destination === "Lead Form") {
    body.promoted_object = { page_id: d.pageId };
    body.destination_type = "ON_AD";
  } else if (d.destination === "WhatsApp") {
    body.promoted_object = { page_id: d.pageId };
    body.destination_type = "WHATSAPP";
  }

  const json = await post(`${accountId}/adsets`, body);
  return json.id;
}

function buildGeo(d) {
  const cities = (d.cities || []).filter(Boolean);
  const regions = (d.regions || []).filter(Boolean);
  if (cities.length || regions.length) {
    return {
      ...(cities.length ? { cities: cities.map((c) => ({ key: c.key, radius: c.radius || 25, distance_unit: "kilometer" })) } : {}),
      ...(regions.length ? { regions: regions.map((r) => ({ key: r.key })) } : {}),
    };
  }
  return { countries: ["IN"] };   // kuch na chuna to poora India
}

/* ---------- 4 · Ad Creative + Ad ---------- */
export async function createAd(accountId, adSetId, d) {
  const link = d.destination === "Lead Form" ? "https://fb.me/" : (d.landingUrl || "https://vakilkaro.in");

  const linkData = {
    message: d.primaryText || "",
    link,
    name: d.headline || d.name,
    description: d.description || "",
    ...(d.imageHash ? { image_hash: d.imageHash } : {}),
    call_to_action: {
      type: ctaType(d.cta),
      value: d.destination === "Lead Form" && d.leadFormId
        ? { lead_gen_form_id: d.leadFormId }
        : { link },
    },
  };

  const creative = await post(`${accountId}/adcreatives`, {
    name: `${d.name} · Creative`,
    object_story_spec: { page_id: d.pageId, link_data: linkData },
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
  });

  const ad = await post(`${accountId}/ads`, {
    name: `${d.name} · Ad`,
    adset_id: adSetId,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  return { adId: ad.id, creativeId: creative.id };
}

function ctaType(cta) {
  const map = {
    "Learn More": "LEARN_MORE", "Sign Up": "SIGN_UP", "Get Quote": "GET_QUOTE",
    "Contact Us": "CONTACT_US", "Book Now": "BOOK_TRAVEL", "Apply Now": "APPLY_NOW",
    "Send Message": "MESSAGE_PAGE", "Download": "DOWNLOAD",
  };
  return map[cta] || "LEARN_MORE";
}

/* ---------- 5 · Poora flow ---------- */
export async function publishFullCampaign(accountId, d) {
  const made = { campaignId: null, adSetId: null, adId: null, leadFormId: null };

  try {
    if (d.destination === "Lead Form") {
      made.leadFormId = await createLeadForm(d.pageId, {
        name: d.name, service: d.service, services: d.services || [], privacyUrl: d.privacyUrl,
      });
    }
    made.campaignId = await createCampaign(accountId, d);
    made.adSetId = await createAdSet(accountId, made.campaignId, d);
    const ad = await createAd(accountId, made.adSetId, { ...d, leadFormId: made.leadFormId });
    made.adId = ad.adId;

    /* Sab ban gaya — ab hi chalu karo. */
    if (d.publishLive) {
      await setStatus(made.campaignId, "ACTIVE");
      await setStatus(made.adSetId, "ACTIVE");
      await setStatus(made.adId, "ACTIVE");
    }

    return { ok: true, ...made, live: Boolean(d.publishLive) };
  } catch (err) {
    /* Adhoora bana to jo bana hai wo paused hi rahega — paisa nahi jalega.
       IDs wapas bhejte hain taaki panel me dikha sakein. */
    err.partial = made;
    throw err;
  }
}

/* ---------- status / edit / archive ---------- */
export async function setStatus(objectId, status) {
  return post(objectId, { status });
}

export async function updateCampaign(campaignId, patch) {
  const body = {};
  if (patch.name) body.name = patch.name;
  if (patch.status) body.status = patch.status;
  return post(campaignId, body);
}

export async function updateAdSet(adSetId, patch) {
  const body = {};
  if (patch.name) body.name = `${patch.name} · Ad Set`;
  if (patch.budget) {
    if (patch.budgetType === "Lifetime") body.lifetime_budget = Math.round(Number(patch.budget) * 100);
    else body.daily_budget = Math.round(Number(patch.budget) * 100);
  }
  if (patch.endDate) body.end_time = `${patch.endDate}T23:59:00+0530`;
  if (patch.startDate) body.start_time = `${patch.startDate}T00:00:00+0530`;
  return Object.keys(body).length ? post(adSetId, body) : { ok: true };
}

/* Delete ke bajaye archive — Meta se delete hua to history bhi chali
   jaati hai, aur purane campaign ka CPL comparison ke liye chahiye hota hai. */
export async function archiveCampaign(campaignId) {
  await post(campaignId, { status: "PAUSED" });
  return post(campaignId, { status: "ARCHIVED" });
}

/* ---------- helpers panel ke liye ---------- */
export async function listPages() {
  const json = await get("me/accounts", { fields: "id,name,instagram_business_account" });
  return (json.data || []).map((p) => ({
    id: p.id, name: p.name, hasInstagram: Boolean(p.instagram_business_account),
  }));
}

/* Location search — Meta apne hi keys leta hai, city ka naam nahi. */
export async function searchLocations(q) {
  const json = await get("search", {
    type: "adgeolocation",
    location_types: ["city", "region"],
    country_code: "IN",
    q,
    limit: 12,
  });
  return (json.data || []).map((l) => ({
    key: l.key, name: l.name, type: l.type,
    region: l.region || "", label: [l.name, l.region].filter(Boolean).join(", "),
  }));
}

/* Lead form se actual leads — naam, number, sab. */
export async function fetchFormLeads(formId, since) {
  const params = { fields: "id,created_time,field_data,ad_id,campaign_id,platform", limit: 100 };
  if (since) params.filtering = [{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(new Date(since).getTime() / 1000) }];
  const json = await get(`${formId}/leads`, params);

  return (json.data || []).map((l) => {
    const f = {};
    (l.field_data || []).forEach((x) => { f[x.name] = (x.values || [])[0] || ""; });
    return {
      extId: l.id,
      createdAt: l.created_time,
      name: f.full_name || f.name || "",
      phone: String(f.phone_number || f.phone || "").replace(/\D/g, "").slice(-10),
      email: f.email || "",
      city: f.city || "",
      service: f.service || "",
      campaignExtId: l.campaign_id || "",
      /* Meta batata hai lead Facebook se aayi ya Instagram se — panel
         me dono cards alag isi field se bharte hain. */
      channel: String(l.platform || "").toLowerCase() === "ig" ? "Instagram" : "Facebook",
    };
  });
}
