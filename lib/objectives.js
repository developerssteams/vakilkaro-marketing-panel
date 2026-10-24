/* ============================================================
   lib/objectives.js — campaign ka objective (Ads Manager jaisa)

   Meta ke naye objectives (OUTCOME_*) aur purane dono pehchante hain.
   Pehle "Engagement" wala campaign bhi "Leads" ban jaata tha — isliye
   Results me reach / engagement leads ke saath mil jaate the.
   ============================================================ */

export const OBJECTIVES = [
  { key: "Leads", icon: "fa-user-plus", color: "#1E8A54" },
  { key: "Calls", icon: "fa-phone", color: "#0E7490" },
  { key: "Messages", icon: "fa-comments", color: "#2a78d6" },
  { key: "Engagement", icon: "fa-heart", color: "#C9246C" },
  { key: "Awareness", icon: "fa-bullhorn", color: "#D9970F" },
  { key: "Traffic", icon: "fa-arrow-pointer", color: "#4a3aa7" },
  { key: "Sales", icon: "fa-cart-shopping", color: "#138a63" },
  { key: "App promotion", icon: "fa-mobile-screen", color: "#475569" },
];

/* Meta ka objective code → naam */
export function metaObjective(raw) {
  const v = String(raw || "").toUpperCase();
  if (!v) return "";
  if (v.includes("LEAD")) return "Leads";
  if (v.includes("MESSAGE")) return "Messages";
  if (v.includes("ENGAGEMENT") || v.includes("POST_ENGAGEMENT") || v.includes("PAGE_LIKES") || v.includes("VIDEO_VIEWS") || v.includes("EVENT_RESPONSES")) return "Engagement";
  if (v.includes("AWARENESS") || v.includes("REACH")) return "Awareness";
  if (v.includes("TRAFFIC") || v.includes("LINK_CLICKS")) return "Traffic";
  if (v.includes("SALES") || v.includes("CONVERSION") || v.includes("PRODUCT_CATALOG") || v.includes("STORE_VISITS")) return "Sales";
  if (v.includes("APP")) return "App promotion";
  return "";
}

/* Objective na pata ho to result ke type se andaaza (daily rows ke liye) */
export function objectiveFromResult(label) {
  const l = String(label || "").toLowerCase();
  if (!l) return "";
  if (l.includes("call")) return "Calls";
  if (l.includes("lead")) return "Leads";
  if (l.includes("messag")) return "Messages";
  if (l.includes("engagement") || l.includes("like") || l.includes("profile") || l.includes("thruplay") || l.includes("video")) return "Engagement";
  if (l.includes("reach") || l.includes("impression")) return "Awareness";
  if (l.includes("click") || l.includes("landing")) return "Traffic";
  if (l.includes("purchase")) return "Sales";
  return "";
}

/* Campaign row ka objective */
/* Calls wale campaign Meta me "Leads" / "Engagement" objective ke andar
   hote hain (ad set ka goal QUALITY_CALL, result "Calls placed").
   Unhe alag "Calls" maante hain, taaki filter me alag dikhein. */
export function isCallCampaign(row) {
  const goal = String(row?.goal || "").toUpperCase();
  if (goal.includes("CALL")) return true;
  if (/call/i.test(String(row?.resultLabel || ""))) return true;
  return /(^|[^a-z])calls?([^a-z]|$)/i.test(String(row?.name || ""));
}

export function objectiveOf(row) {
  if (isCallCampaign(row)) return "Calls";
  return metaObjective(row?.objectiveRaw) || String(row?.objective || "") || objectiveFromResult(row?.resultLabel) || "";
}