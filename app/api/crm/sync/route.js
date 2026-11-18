import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { crmConfig, fetchLostLeads, fetchLeadReport } from "../../../../lib/crm-db";
import { mapRows } from "../../../../lib/crm-mapper";

/* CRM se lost leads laao aur panel ke format me badal ke wapas do.

   Server yahan panel ke storage me likhta nahi — laakar deta hai, aur
   client apne localStorage me merge karta hai. Jab Postgres aayega tab
   yahin insert ho jayega, route wahi rahega. */
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