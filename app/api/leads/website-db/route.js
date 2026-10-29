import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { websiteDbConfig, fetchWebsiteLeads } from "../../../../lib/website-db";

export const runtime = "nodejs";

/* POST { since: ISO } → website ke forms (enquiries, contact, ODR) ki leads */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!websiteDbConfig().ready) return NextResponse.json({ ok: true, configured: false, leads: [] });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const since = /^\d{4}-\d{2}-\d{2}/.test(String(d.since || "")) ? d.since : "2000-01-01T00:00:00Z";
  try {
    const r = await fetchWebsiteLeads(since);
    return NextResponse.json({ ok: true, configured: true, ...r, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, error: e?.message || "Website database error", leads: [] }, { status: 502 });
  }
}