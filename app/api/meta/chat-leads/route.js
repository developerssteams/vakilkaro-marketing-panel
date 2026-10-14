import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { waLeadsReady, fetchWaLeads } from "../../../../lib/wa-leads";
import { waDbError } from "../../../../lib/wa-db";
import { adNames } from "../../../../lib/meta-api";

/* POST { since: "2026-09-01" } → WhatsApp leads (whatsapp-ai database se)
   Ad se aayi ho to ad → campaign ka naam Meta se jod dete hain, taaki
   Lead Capture me campaign-wise milaan ho sake. */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!waLeadsReady()) return NextResponse.json({ ok: true, configured: false, leads: [] });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(d.since || "")) ? d.since : "";

  let leads;
  try { leads = await fetchWaLeads(since); }
  catch (e) { return NextResponse.json({ ok: false, configured: true, error: `WhatsApp database: ${waDbError(e)}`, leads: [] }); }

  const ids = [...new Set(leads.map((l) => l.adId).filter((x) => /^\d{5,25}$/.test(x)))];
  let names = {};
  if (ids.length && metaConfig().ready) names = await adNames(ids).catch(() => ({}));
  leads = leads.map((l) => {
    const n = names[l.adId] || {};
    return { ...l, adName: n.adName || l.adHeadline || "", campaignName: n.campaignName || l.campaignName || "", account: n.accountId ? `act_${n.accountId}` : "" };
  });
  return NextResponse.json({ ok: true, configured: true, leads });
}
