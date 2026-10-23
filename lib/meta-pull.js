/* ============================================================
   lib/meta-pull.js — CLIENT ONLY

   Meta se leads → Lead Capture (Inbox Log)
   Meta se payments → Ad Wallet (Ledger)

   Dono dedupe karte hain (Meta ki ID se), isliye baar-baar chalana
   safe hai. Auto-sync ke saath apne aap chalte hain:
     · leads    — har 15 minute (pichli baar se 1 din pehle tak)
     · payments — har 6 ghante, aur Ad Wallet khulte hi (1 ghante se purana ho to)
   Pehli baar: leads 90 din, payments 1 saal.
   ============================================================ */

import { readRows, writeRows, uid, logActivity } from "./marketing-local";
import { panelMetaAccountIds, isoAgo } from "./sync-merge";

const LEADS = "lead-capture__inbox-log";
const FORMS = "lead-capture__forms";
const LEDGER = "ad-wallet__ledger";
const ACCOUNTS = "ad-accounts__accounts";
const LEADS_AT = "vk_meta_leads_at";
const PAY_AT = "vk_meta_pay_at";
const LEADS_DIAG = "vk_meta_leads_diag";
const PAY_ERR = "vk_meta_pay_err";
const PAY_V = "vk_meta_pay_v";
const PAY_VER = "5";
const PREPAID = "vk_meta_prepaid";
export function prepaidBalances() { try { return JSON.parse(get(PREPAID) || "{}"); } catch { return {}; } }

const get = (k) => { try { return window.localStorage.getItem(k) || ""; } catch { return ""; } };
const put = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* */ } };
const LEADS_FULL = "vk_meta_leads_full_v2";
/* Meta ka created_time UTC me hota hai ("…T20:10:00+0000"). Panel ka
   din IST (browser ka local) me — warna raat 12–5:30 ki leads galat din. */
function localDay(t) {
  if (!t) return "";
  const d = new Date(String(t).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 10);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const dayBefore = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function accountNames() {
  const m = {};
  readRows(ACCOUNTS).forEach((a) => { if (a.accountId) m[String(a.accountId).trim()] = a.name; });
  return m;
}

export function lastLeadPull() { return get(LEADS_AT); }
export function lastPaymentSync() { return get(PAY_AT); }
/* Naye code ke baad pehli baar — purani Meta entries (Meta billing / Auto-debit)
   badalni hain, chahe aakhri sync abhi hua ho */
export function paymentsNeedFullSync() { return get(PAY_V) !== PAY_VER; }
export function lastLeadDiagnosis() { try { return JSON.parse(get(LEADS_DIAG) || "null"); } catch { return null; } }
export function lastPaymentErrors() { try { return JSON.parse(get(PAY_ERR) || "[]"); } catch { return []; } }

/* Leads 0 aayi to kaaran — Meta ke apne numbers se, andaaze se nahi */
export function leadDiagnosisText(d) {
  if (!d) return null;
  const tv = d.tokenVar || "META_TOKEN";
  const pageNames = (d.adPages || []).map((p) => (p.name && p.name !== p.id ? `${p.name} (${p.id})` : p.id)).join(", ");
  if (d.reason === "ads-error") return {
    title: "Meta refused to list the ads of your ad account",
    body: `Meta said: "${d.adsError}". The token in ${tv} needs ads_read on this ad account (Business Settings → System users → Assign assets → Ad accounts). Or put a Page token in META_PAGE_TOKENS — leads are then read straight from the Page's lead forms.`,
  };
  if (d.reason === "scope") return {
    title: "Your Meta token cannot read leads",
    body: `${tv} is missing: ${d.missingScopes.join(", ")}. Generate a token with these ticked and put it in .env.local as META_LEADS_TOKEN (your META_TOKEN for WhatsApp stays untouched), then restart the server.`,
  };
  if (d.reason === "no-pages") return {
    title: "No Facebook Page token available — leads belong to the Page",
    body: `${pageNames ? `Your lead ads run from Page ${pageNames}. ` : ""}Fix any one: (1) Business Settings → Users → System users → your system user → Assign assets → Pages → select the page → Full control, then regenerate the token; or (2) paste a Page access token in .env.local as META_PAGE_TOKENS=pageId:token and restart.${d.pagesError ? ` Meta said: "${d.pagesError}".` : ""}`,
  };
  if (d.reason === "lead-access") return {
    title: `Meta says your forms have ${d.formLeadTotal.toLocaleString("en-IN")} leads, but did not share them`,
    body: `The Page has Leads Access turned on. Business Settings → Integrations → Leads access → select the Page → assign your system user (and the app). Then press Pull leads from Meta.${d.leadError ? ` Meta said: "${d.leadError}".` : ""}`,
  };
  return {
    title: "Meta has no leads on your lead forms for this period",
    body: `${d.adsChecked} lead ads and ${d.forms} lead forms were checked. If Ads Manager shows leads, they may be messaging conversations (WhatsApp/Messenger), which are not form leads.`,
  };
}

/* ---------------- LEADS ---------------- */
export async function pullMetaLeads({ since, quiet = false } = {}) {
  const ids = panelMetaAccountIds();
  if (!ids.length) return { ok: false, error: "Connect a Meta account in Ad Accounts first." };
  /* Pehle "0 leads" wale pull ne bhi "last pulled" aage badha diya tha,
     isliye purani leads kabhi nahi aayi. Ek baar poore 90 din dobara
     laate hain (Meta API leads 90 din tak hi deta hai). */
  const full = !get(LEADS_FULL);
  const from = since || (full || !lastLeadPull() ? isoAgo(90) : dayBefore(lastLeadPull(), 1));

  const res = await fetch("/api/meta/account-leads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountIds: ids, since: from }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "Could not load leads" };

  const names = accountNames();
  let rows = readRows(LEADS);
  /* Purani Meta leads ka din bhi IST me theek karo */
  let fixed = 0;
  rows = rows.map((r) => {
    if (!r.extId || !r.receivedTime) return r;
    const d = localDay(r.receivedTime);
    if (d && d !== r.receivedAt) { fixed += 1; return { ...r, receivedAt: d }; }
    return r;
  });
  if (fixed) writeRows(LEADS, rows);
  const seenExt = new Set(rows.map((r) => r.extId).filter(Boolean));
  const seenPhone = new Set(rows.map((r) => String(r.phone || "").replace(/\D/g, "").slice(-10)).filter(Boolean));
  const add = []; let fb = 0; let ig = 0;

  (data.leads || []).forEach((l) => {
    if (l.extId && seenExt.has(l.extId)) return;
    seenExt.add(l.extId);
    const dup = l.phone && seenPhone.has(l.phone);
    add.push({
      /* Pakki id (Meta lead ID se) — do computer ek saath leads laayein to bhi ek hi */
      id: l.extId ? `ml-${l.extId}` : uid(), extId: l.extId, name: l.name || "—", phone: l.phone, email: l.email,
      city: l.city, state: l.state || "", service: l.service, source: l.channel,
      campaign: l.campaignName || l.campaignExtId || "", adName: l.adName || "", formId: l.formId || "",
      account: names[l.account] || l.account || "",
      receivedAt: localDay(l.createdAt),
      receivedTime: l.createdAt || "",
      flag: dup ? "Duplicate" : "Clean", stage: "New", status: "Received",
      createdAt: new Date().toISOString(),
    });
    if (l.phone) seenPhone.add(l.phone);
    if (l.channel === "Instagram") ig += 1; else fb += 1;
  });

  if (add.length) {
    writeRows(LEADS, [...add, ...rows]);
    /* naye lead forms bhi yaad rakho — Lead Capture → Forms me dikhenge */
    const forms = readRows(FORMS);
    const known = new Set(forms.map((f) => String(f.formId || "")));
    const newForms = [...new Set(add.map((l) => l.formId).filter((x) => x && !known.has(x)))]
      .map((formId) => ({ id: `mf-${formId}`, formId, name: `Meta form ${formId}`, platform: "Meta", status: "Active", createdAt: new Date().toISOString() }));
    if (newForms.length) writeRows(FORMS, [...newForms, ...forms]);
  }
  /* Permission ki wajah se 0 aayi to "last pulled" mat badlo — theek hone
     ke baad agla pull phir se 90 din peeche se laaye */
  const diag = data.diagnosis || null;
  put(LEADS_DIAG, JSON.stringify(diag));
  if (!diag || diag.reason === "none-found") put(LEADS_AT, new Date().toISOString());
  /* Backfill sirf tab "ho gaya" jab Meta ne sach me leads di hon */
  if (!diag && (data.leads || []).length) put(LEADS_FULL, new Date().toISOString());
  if (add.length || !quiet) {
    logActivity({ dataset: LEADS, action: "Created", target: "Meta Lead Sync", detail: `${add.length} new leads · Facebook ${fb} · Instagram ${ig} · ${data.adsChecked || 0} lead ads checked` });
  }
  return { ok: true, added: add.length, fb, ig, checked: (data.leads || []).length, adsChecked: data.adsChecked || 0, errors: data.errors || [], diagnosis: diag };
}

/* ---------------- PAYMENTS ---------------- */
export async function syncMetaPayments({ since, quiet = false } = {}) {
  const ids = panelMetaAccountIds();
  if (!ids.length) return { ok: false, error: "Connect a Meta account in Ad Accounts first." };
  /* v2: Transaction ID, Meta status, VAT invoice — purani entries me nahi the,
     isliye ek baar poora saal dobara */
  const full = get(PAY_V) !== PAY_VER;
  const from = since || (!full && lastPaymentSync() ? dayBefore(lastPaymentSync(), 7) : isoAgo(365));

  const res = await fetch("/api/meta/payments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountIds: ids, since: from }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "Could not load payments" };

  const names = accountNames();
  /* Meta ki entries har sync pe us account + period ke liye nayi banti hain
     (purani "Auto-debit / Meta billing" duplicate entries hat jaati hain).
     Haath se daali entries (source Meta Billing nahi) kabhi nahi chhooti. */
  const okAccts = new Set(ids.filter((id) => !(data.errors || []).some((e) => e.account === id)));
  const acctOf = (r) => r.accountId || (String(r.extId || "").match(/^meta-(act_\d+)-/) || [])[1] || "";
  const all = readRows(LEDGER);
  /* Poora sync (naya version): saari purani Meta entries hatao — chahe account
     pata ho ya na ho — taaki "Auto-debit / Meta billing" wale duplicate na bachein */
  const rows = all.filter((r) => !(r.source === "Meta Billing" && okAccts.size
    && (full ? (!acctOf(r) || okAccts.has(acctOf(r))) : (okAccts.has(acctOf(r)) && String(r.date || "") >= from))));
  const removed = all.length - rows.length;
  const byExt = new Map(rows.filter((r) => r.extId).map((r) => [r.extId, r]));
  let added = 0; let updated = 0;
  const next = [...rows];

  (data.payments || []).forEach((p) => {
    const extId = `meta-${p.account}-${p.extId}`;
    const entry = {
      date: p.date, time: p.time || "", account: names[p.account] || p.account, accountId: p.account, platform: "Meta",
      txId: p.txId || "", metaStatus: p.metaStatus || "", method: p.method || "", vatInvoiceId: p.vatInvoiceId || "",
      type: p.type, amount: String(Math.round(p.amount * 100) / 100), payMode: p.payMode || p.method || "",
      reference: p.extId.startsWith("act-") ? "" : p.extId,
      note: `Meta billing${p.reason ? ` · ${String(p.reason).replace(/_/g, " ")}` : ""}`,
      status: p.status, source: "Meta Billing", extId,
    };
    const old = byExt.get(extId);
    if (old) {
      const i = next.findIndex((r) => r.id === old.id);
      next[i] = { ...old, ...entry, updatedAt: new Date().toISOString() };
      updated += 1;
    } else {
      next.unshift({ id: `mp-${extId}`, ...entry, createdAt: new Date().toISOString() });
      added += 1;
    }
  });

  if (added || updated || removed) writeRows(LEDGER, next);
  const errors = data.errors || [];
  put(PAY_ERR, JSON.stringify(errors));
  if (errors.length < ids.length) { put(PAY_AT, new Date().toISOString()); put(PAY_V, PAY_VER); }
  put(PREPAID, JSON.stringify(data.balances || {}));
  if (added || !quiet) {
    logActivity({ dataset: LEDGER, action: "Updated", target: "Meta Billing Sync", detail: `${added} new · ${updated} updated payments${errors.length ? ` · ${errors.length} account(s) failed` : ""}` });
  }
  return { ok: true, added, updated, errors, sources: data.sources || {} };
}

/* Auto-sync ke baad — sirf jab waqt ho gaya ho */
export async function autoPullExtras() {
  const now = Date.now();
  const out = {};
  const lAt = Date.parse(lastLeadPull() || 0) || 0;
  if (now - lAt > 15 * 60000) out.leads = await pullMetaLeads({ quiet: true }).catch((e) => ({ ok: false, error: e?.message }));
  const pAt = Date.parse(lastPaymentSync() || 0) || 0;
  if (now - pAt > 6 * 3600000) out.payments = await syncMetaPayments({ quiet: true }).catch((e) => ({ ok: false, error: e?.message }));
  return out;
}
