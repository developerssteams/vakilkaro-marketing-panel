/* ============================================================
   lib/crm-mapper.js

   CRM ka raw row → panel ka Lost Pool format.

   Teen kaam hote hain yahan:
     1. Reason se bucket nikalna  (kis lead ko kya bhejna hai)
     2. Score nikalna             (kis lead pe pehle mehnat karni hai)
     3. Phone normalize + dedupe  (ek hi lead do baar na aaye)
   ============================================================ */

/* Har bucket ke keywords. CRM me log kuch bhi likhte hain —
   "price high", "mehnga", "budget zyada" — teeno ek hi baat hai.
   Isliye keyword matching, exact match nahi. */
const BUCKET_RULES = [
  /* Junk sabse pehle — "wrong number" jaisi entry kisi aur bucket me
     nahi jaani chahiye. */
  { bucket: "Wrong / Junk", keys: ["wrong number", "junk", "fake", "invalid", "spam", "galat number", "test entry"] },
  { bucket: "Price High", keys: ["price", "mehnga", "expensive", "costly", "rate", "high price", "zyada", "budget high", "fees"] },
  { bucket: "Baad Mein Karunga", keys: ["baad", "later", "next month", "abhi nahi", "future", "postpone", "wait", "hold", "думать", "soch"] },
  { bucket: "Competitor Se Karwa Liya", keys: ["competitor", "kisi aur", "someone else", "already done", "karwa liya", "other ca", "dusre"] },
  { bucket: "Budget Nahi", keys: ["budget nahi", "no budget", "paisa nahi", "afford", "funds", "financial"] },
  { bucket: "No Response", keys: ["no response", "not reachable", "uthaya nahi", "utha nahi", "nahi utha", "no reply", "unreachable", "switch off", "busy", "not picking", "call nahi"] },
  { bucket: "Documents Nahi The", keys: ["document", "docs", "papers", "kagaz", "incomplete", "pending doc"] },
];

/* Kuch CRM me stage ka naam hi lost reason hota hai — "Price Issue",
   "Not Answered", "Less Interested". Inko seedha map kar dete hain,
   keyword matching se pehle, taaki pakka sahi bucket mile. */
const STAGE_MAP = {
  "price issue": "Price High",
  "not answered": "No Response",
  "less interested": "Baad Mein Karunga",
  "non-relevant": "Wrong / Junk",
  "non relevant": "Wrong / Junk",
  "lost": "",                       // generic — keyword se dhoondho
  "very interested": "Baad Mein Karunga",
};

export function detectBucket(reason, status) {
  /* Stage ka exact naam pehle — ye sabse pakka signal hai */
  const stage = String(status || "").trim().toLowerCase();
  if (stage && Object.prototype.hasOwnProperty.call(STAGE_MAP, stage)) {
    const mapped = STAGE_MAP[stage];
    if (mapped) return mapped;
  }

  const text = `${reason || ""} ${status || ""}`.toLowerCase();
  if (!text.trim()) return "";
  for (const rule of BUCKET_RULES) {
    if (rule.keys.some((k) => text.includes(k))) return rule.bucket;
  }
  return "";   // khaali — panel me manually chunna padega
}

export function normalizePhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  if (d.length > 10) return d.slice(-10);
  return d;
}

/* Score = kis lead pe pehle kaam karna hai.
   Quote diya tha matlab paisa discuss hua — sabse bada signal. */
export function calcScore(lead) {
  let s = 0;
  const quoted = Number(lead.quoted || 0);
  if (quoted > 0) s += 40;
  if (quoted > 25000) s += 10;

  if (lead.lostAt) {
    const days = (Date.now() - new Date(lead.lostAt).getTime()) / 86400000;
    if (days <= 30) s += 25;
    else if (days <= 90) s += 15;
    else if (days <= 180) s += 5;
  }

  if (String(lead.email || "").includes("@")) s += 10;
  if (lead.city) s += 5;
  s -= Math.min(20, 5 * Number(lead.attempts || 0));

  return Math.max(0, Math.min(100, s));
}

export function scoreToPriority(score) {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

/* Service ke naam CRM me alag ho sakte hain — panel ke standard
   naam me badal dete hain, warna service-wise filter tootega. */
const SERVICE_ALIASES = {
  "trademark": "Trademark Registration",
  "tm": "Trademark Registration",
  "company": "Company Registration",
  "pvt ltd": "Company Registration",
  "private limited": "Company Registration",
  "section 8": "Section 8 / NGO",
  "ngo": "Section 8 / NGO",
  "trust": "Section 8 / NGO",
  "society": "Section 8 / NGO",
  "microfinance": "Section 8 Microfinance",
  "mfc": "Section 8 Microfinance",
  "nbfc": "NBFC Registration",
  "gst": "GST Registration",
  "fssai": "FSSAI License",
  "food": "FSSAI License",
  "llp": "LLP Registration",
  "odr": "ODR / Mediation",
  "mediation": "ODR / Mediation",
};

export function normalizeService(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  const low = v.toLowerCase();
  for (const [key, val] of Object.entries(SERVICE_ALIASES)) {
    if (low.includes(key)) return val;
  }
  return v;   // jaisa hai waisa, panel me dikhega
}

function toDate(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  } catch { return ""; }
}

/* ---------- ek row → panel format ---------- */
export function mapRow(row) {
  const phone = normalizePhone(row.phone);
  const lostAt = toDate(row.lost_at);
  const service = normalizeService(row.service);
  /* Stage table wale CRM me stage_label hi reason ka kaam karta hai */
  const stageText = row.stage_label || row.status || "";
  const bucket = detectBucket(row.reason, stageText);

  const base = {
    crmId: String(row.crm_id ?? ""),
    name: String(row.name || "").trim() || "Unknown",
    phone,
    email: String(row.email || "").trim(),
    city: String(row.city || "").trim(),
    service,
    bucket,
    lostReason: String(row.reason || row.stage_label || "").trim(),
    stageLabel: String(row.stage_label || "").trim(),
    pipelineId: row.pipeline_id ? String(row.pipeline_id) : "",
    stageId: row.stage_id ? String(row.stage_id) : "",
    quoted: row.quoted ? String(Math.round(Number(row.quoted) || 0)) : "",
    campaign: String(row.campaign || "").trim(),
    lastStaff: String(row.staff || "").trim(),
    lostAt,
    attempts: "0",
    nextEligible: "",
    dnd: "No",
    status: "Pool",
  };

  const score = calcScore({ ...base, lostAt, quoted: base.quoted });
  return { ...base, priority: scoreToPriority(score), score: String(score) };
}

/* ---------- poora batch ---------- */
export function mapRows(rows) {
  const out = [];
  const skipped = { badPhone: 0, duplicate: 0, noBucket: 0 };
  const seen = new Set();

  for (const r of rows) {
    const mapped = mapRow(r);

    if (mapped.phone.length < 10) { skipped.badPhone += 1; continue; }
    if (seen.has(mapped.phone)) { skipped.duplicate += 1; continue; }

    seen.add(mapped.phone);
    if (!mapped.bucket) skipped.noBucket += 1;   // aati hai, bas bucket khaali
    out.push(mapped);
  }

  return { leads: out, skipped };
}
