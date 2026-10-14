import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchAccountLeads, fetchPageLeads, collectPageTokens, tokenScopes, resetUsage, getUsage } from "../../../../lib/meta-api";

const LEAD_SCOPES = ["leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_ads"];

/* POST { accountIds: ["act_1"], since: "2026-09-01" } → har lead ad ki saari leads

   Teen raaste, sab ka mel (same lead dobara nahi gini jaati):
     1. har lead ad → /{ad}/leads  (META_LEADS_TOKEN ya META_TOKEN)
     2. wahi ad, uske Page ke token se (ad token fail ho to)
     3. har Page → lead forms → leads (me/accounts, META_PAGE_TOKENS,
        ya lead ads ke Page ID se) */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const cfg = metaConfig();
  if (!cfg.ready && !cfg.pageTokens.length) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const ids = [...new Set((d.accountIds || []).map(String).filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
  if (!ids.length && !cfg.pageTokens.length) return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(d.since || "")) ? d.since : "";

  resetUsage();
  const leads = []; const errors = []; let adsChecked = 0; let adsTotal = 0;
  const adErrors = []; const adPageIds = new Set();

  /* Pehle jo Page tokens turant mil sakein */
  let col = await collectPageTokens().catch((e) => ({ pages: [], errors: [{ where: "pages", message: e?.message }] }));
  const tokMap = () => Object.fromEntries(col.pages.filter((p) => p.token).map((p) => [p.id, p.token]));

  /* Raasta 1+2 · har lead ad se */
  for (const id of ids) {
    try {
      const r = await fetchAccountLeads(id, since, tokMap());
      leads.push(...r.leads.map((l) => ({ ...l, account: id })));
      adsChecked += r.adsChecked; adsTotal += r.adsTotal;
      r.pageIds.forEach((p) => adPageIds.add(p));
      r.errors.forEach((e) => errors.push({ account: id, ...e }));
    } catch (e) {
      const msg = e?.message || "failed";
      errors.push({ account: id, message: msg });
      if (e?.stage === "ads") adErrors.push(msg);
    }
  }

  /* Lead ads jis Page se chal rahe hain, uska token bhi try karo */
  const missingIds = [...adPageIds].filter((p) => !col.pages.find((x) => x.id === p && x.token));
  if (missingIds.length) col = await collectPageTokens(missingIds, col).catch(() => col);

  /* Raasta 3 · Page → lead forms → leads */
  const page = await fetchPageLeads(since, col).catch((e) => ({ leads: [], forms: [], pages: [], errors: [{ where: "pages", message: e?.message }] }));
  const seen = new Set(leads.map((l) => l.extId));
  page.leads.forEach((l) => { if (!seen.has(l.extId)) { seen.add(l.extId); leads.push({ ...l, account: "" }); } });

  /* Kuch nahi aaya to kaaran batao — andaaza nahi, Meta ke apne numbers se */
  let diagnosis = null;
  const formLeadTotal = page.forms.reduce((t, f) => t + f.leadsCount, 0);
  if (!leads.length) {
    const granted = cfg.leadsToken ? await tokenScopes(cfg.leadsToken) : null;
    const scopes = granted || [];
    const missing = LEAD_SCOPES.filter((s) => granted && !scopes.includes(s));
    const leadErr = errors.find((e) => e.ad)?.message || "";
    const pagesWithToken = page.pages.filter((p) => p.hasToken).length;
    diagnosis = {
      adsChecked, adsTotal, pages: page.pages.length, pagesWithToken,
      forms: page.forms.length, formLeadTotal, missingScopes: missing, scopesKnown: Boolean(granted),
      scopes, tokenVar: cfg.leadsTokenVar, pageTokensSet: cfg.pageTokens.length,
      adPages: page.pages.filter((p) => p.via === "ad" && !p.hasToken).map((p) => ({ id: p.id, name: p.name })),
      adsError: adErrors[0] || "", leadError: leadErr,
      pagesError: page.errors.find((e) => e.where === "pages")?.message || "",
      reason: adErrors.length && !adsChecked && !pagesWithToken ? "ads-error"
        : missing.includes("leads_retrieval") ? "scope"
        : !pagesWithToken ? "no-pages"
        : formLeadTotal > 0 ? "lead-access"
        : "none-found",
    };
  }
  return NextResponse.json({
    ok: true, leads,
    errors: [...errors, ...page.errors.map((e) => ({ account: e.where, message: e.message }))],
    adsChecked, forms: page.forms, pages: page.pages, diagnosis, usage: getUsage(),
  });
}
