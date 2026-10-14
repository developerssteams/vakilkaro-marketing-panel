import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchRunningLeadForms, fetchCampaignLeadForms } from "../../../../lib/meta-api";

/* POST { accountIds: ["act_1"] } → chal rahe ads ke lead forms + unke sawaal */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const cfg = metaConfig();
  if (!cfg.ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  /* Ek campaign ke ads ke forms (Ads drawer se) */
  if (d.campaignId) {
    if (!/^\d{6,25}$/.test(String(d.campaignId))) return NextResponse.json({ error: "Bad campaign id" }, { status: 400 });
    try { return NextResponse.json({ ok: true, ...(await fetchCampaignLeadForms(String(d.campaignId))) }); }
    catch (e) { return NextResponse.json({ error: e?.message || "Could not load lead forms" }, { status: 502 }); }
  }
  const ids = [...new Set((d.accountIds || []).map(String).filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
  if (!ids.length) return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  try {
    const r = await fetchRunningLeadForms(ids);
    return NextResponse.json({ ok: true, ...r, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Could not load lead forms" }, { status: 502 });
  }
}
