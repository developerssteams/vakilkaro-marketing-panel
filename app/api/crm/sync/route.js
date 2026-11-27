import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { crmConfig, fetchLostLeads, fetchLeadReport, crmSetting } from "../../../../lib/crm-db";
import { mapRows } from "../../../../lib/crm-mapper";

/* CRM se lost leads laao aur panel ke format me badal ke wapas do.

   Server yahan panel ke storage me likhta nahi — laakar deta hai, aur
   client apne localStorage me merge karta hai. Jab Postgres aayega tab
   yahin insert ho jayega, route wahi rahega. */
/* Meta sync me Facebook se leads aane me der lag sakti hai */
export const maxDuration = 60;

/* Facebook Leads → CRM (CRM ki meta-leads.php) — panel usi file ke JSON API se
   status / form mapping / sync / subscribe karta hai. Key = CRM ki cron key
   (CRM ke database ki app_settings se), isliye panel me alag se kuch nahi daalna. */
async function metaLeads(d, user, request) {
  const allowed = ["status", "map", "sync", "subscribe", "audit"];
  const act = allowed.includes(d.meta) ? d.meta : "status";
  const base = (process.env.CRM_META_URL || "https://crm.vakilkaro.com/meta-leads.php").trim();
  let key = "";
  try { key = await crmSetting("meta_lead_cron_key"); } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not read CRM settings" }, { status: 502 });
  }
  if (!key) return NextResponse.json({ error: "Facebook Leads is not set up in the CRM yet — open meta-leads.php in the CRM once." }, { status: 404 });
  const body = act === "map" ? { map: d.map || {} } : act === "sync" ? { since: d.since || "" } : act === "status" ? { fv: d.fv || "ads", refresh: Boolean(d.refresh), log: Number(d.log) || 150 }
    : act === "audit" ? { src: d.src || "", who: d.who || "", act: d.act || "", from: d.from || "", to: d.to || "" } : {};
  /* CRM ke Audit Log ke liye: panel me kaun login hai, kis IP / browser se */
  const actor = Buffer.from(JSON.stringify({
    name: user?.name || "Panel user", email: user?.email || "", role: user?.role_name || user?.role_key || "",
    ip: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "",
    ua: request.headers.get("user-agent") || "",
  })).toString("base64");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 55000);
  try {
    const r = await fetch(`${base}?api=${act}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-ML-Key": key, "X-ML-Actor": actor }, body: JSON.stringify(body),
      cache: "no-store", signal: ctrl.signal,
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!j) return NextResponse.json({ error: `CRM did not answer properly (HTTP ${r.status}) — check that meta-leads.php is the new version.` }, { status: 502 });
    if (!r.ok || j.ok === false) return NextResponse.json({ ...j, error: j.error || `CRM error (HTTP ${r.status})` }, { status: r.ok ? 400 : r.status });
    return NextResponse.json({ ...j, at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err?.name === "AbortError" ? "CRM took too long — try again." : `Could not reach the CRM (${err?.message || "network"})` }, { status: 504 });
  } finally { clearTimeout(t); }
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const cfg = crmConfig();
  if (!cfg.ready) {
    return NextResponse.json({
      error: "CRM database is not connected — add the CRM_DB_* values to .env.local.",
      needsSetup: true,
    }, { status: 503 });
  }

  let d = {};
  try { d = await request.json(); } catch { d = {}; }

  if (d.meta) return metaLeads(d, user, request);

  /* Lead Report — ek date range ki saari CRM leads aur unka abhi ka stage */
  if (d.report) {
    const ok = (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
    if (!ok(d.from) || !ok(d.to)) return NextResponse.json({ error: "Pick a valid date range." }, { status: 400 });
    try {
      const res = await fetchLeadReport({ from: d.from, to: d.to });
      return NextResponse.json({ ...res, from: d.from, to: d.to, at: new Date().toISOString() });
    } catch (err) {
      return NextResponse.json({ error: err?.message || "Could not read leads from CRM", code: err?.code }, { status: 502 });
    }
  }

  const since = d.since && /^\d{4}-\d{2}-\d{2}$/.test(d.since) ? d.since : null;
  const limit = Math.min(Number(d.limit || 500), 5000);

  try {
    const res = await fetchLostLeads({ since, limit });
    const { leads, skipped } = mapRows(res.rows);

    return NextResponse.json({
      ok: true,
      fetched: res.count,
      leads,
      skipped,
      /* Bucket na mile to remarketing ka koi journey trigger nahi hoga —
         isliye alag se batate hain. */
      needsBucket: leads.filter((l) => !l.bucket).length,
      range: since ? `${since} to today` : "all",
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Sync failed", code: err?.code }, { status: 502 });
  }
}