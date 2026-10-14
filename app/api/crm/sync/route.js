import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { crmConfig, fetchLostLeads } from "../../../../lib/crm-db";
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
