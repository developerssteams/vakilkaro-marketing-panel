/* ============================================================
   lib/meta-metrics.js — Ads Manager jaisa hisaab, ek jagah

   Facebook card, Instagram card aur FB vs IG view teeno yahi use
   karte hain, taaki ek hi number teen jagah teen tarah na dikhe.
   ============================================================ */

const n = (v) => { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; };

/* Daily row isi campaign ki hai? Campaign ID pehle (naam badal sakta
   hai), ID na ho to naam. Account bhi milate hain. */
export function sameCampaign(row, d) {
  if (row.accountId && d.account && d.account !== row.accountId) return false;
  if (row.extId && d.extId) return String(row.extId) === String(d.extId);
  return String(d.campaign || "") === String(row.name || "");
}

/* Ads Manager ke columns — sab jodne layak (additive) */
export function sumMetrics(rows) {
  const t = { spend: 0, results: 0, formLeads: 0, chats: 0, impressions: 0, clicks: 0, linkClicks: 0, entries: rows.length };
  const labels = new Set();
  rows.forEach((d) => {
    t.spend += n(d.spend);
    /* purani rows me results nahi tha — leads hi results hai (v2) */
    t.results += n(d.results ?? d.leads);
    t.formLeads += n(d.formLeads); t.chats += n(d.chats);
    t.impressions += n(d.impressions); t.clicks += n(d.clicks); t.linkClicks += n(d.linkClicks);
    if (d.resultLabel && (n(d.results ?? d.leads) > 0 || n(d.spend) > 0)) labels.add(d.resultLabel);
  });
  t.leads = t.results;
  t.label = labels.size === 1 ? [...labels][0] : labels.size ? "Multiple conversions" : "";
  t.spend = Math.round(t.spend * 100) / 100;
  return t;
}

/* Ads Manager ke formula */
export const costPerResult = (t) => (t.results > 0 ? t.spend / t.results : 0);
export const ctrAll = (t) => (t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0);
export const ctrLink = (t) => (t.impressions > 0 ? (t.linkClicks / t.impressions) * 100 : 0);
export const cpm = (t) => (t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0);
export const cpcLink = (t) => (t.linkClicks > 0 ? t.spend / t.linkClicks : 0);

/* Budget ka text — Ads Manager jaisa */
export function budgetInfo(row, fmt) {
  const daily = n(row.dailyBudget); const life = n(row.totalBudget);
  const src = row.budgetSource === "Ad set" ? "Ad set budget" : "";
  if (daily > 0) return { main: `${fmt(daily)}/day`, sub: src };
  if (life > 0) return { main: `${fmt(life)}`, sub: src ? `${src} · lifetime` : "Lifetime" };
  return { main: "—", sub: src };
}
